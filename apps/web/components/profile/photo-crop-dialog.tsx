"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Slider } from "@camp404/ui/components/slider";
import type { AvatarFitProps } from "@camp404/ui/components/avatar-upload";
import { cn } from "@camp404/ui/lib/utils";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  cropToViewPercent,
  initialCrop,
  panBy,
  zoomOf,
  zoomTo,
  type ImageSize,
  type SquareCrop,
} from "@/lib/photo-crop";

// "Fit your photo" (issue #276, Option A approved by the owner 2026-10-02).
// The round frame stays still; the member drags the photo under it and zooms
// with the slider, the − and + buttons, a mouse wheel or a pinch. The square
// around the circle is what lib/image.ts cuts, so what the previews show is
// what is saved. The maths, and the rule that the circle never shows a gap,
// live in lib/photo-crop.ts.

const ZOOM_STEP = 0.2;
/** Screen pixels an arrow key moves the photo; with Shift, five times that. */
const KEY_STEP = 10;

/** The photo cut to `crop`, filling a square box (the frame or a preview). */
function CroppedPhoto({
  src,
  image,
  crop,
}: {
  src: string;
  image: ImageSize;
  crop: SquareCrop;
}) {
  const at = cropToViewPercent(crop, image);
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className="pointer-events-none absolute max-w-none select-none"
      style={{
        left: `${at.left}%`,
        top: `${at.top}%`,
        width: `${at.width}%`,
        height: `${at.height}%`,
      }}
    />
  );
}

function Preview({
  label,
  px,
  ...photo
}: {
  label: string;
  px: number;
  src: string;
  image: ImageSize;
  crop: SquareCrop;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
      <div
        role="img"
        aria-label={`Preview: ${label.toLowerCase()}`}
        className="relative overflow-hidden rounded-full border border-border bg-[#0b0c0e]"
        style={{ width: px, height: px }}
      >
        <CroppedPhoto {...photo} />
      </div>
      {label}
    </div>
  );
}

export function PhotoCropDialog({
  file,
  onSave,
  onCancel,
  onPickAnother,
}: AvatarFitProps) {
  const [src, setSrc] = React.useState<string | null>(null);
  const [image, setImage] = React.useState<ImageSize | null>(null);
  const [crop, setCrop] = React.useState<SquareCrop | null>(null);
  const [broken, setBroken] = React.useState(false);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const pinchFrom = React.useRef(0);

  // A new photo (first pick or "Use another photo") starts over.
  React.useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    setImage(null);
    setCrop(null);
    setBroken(false);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const viewSize = () => stageRef.current?.getBoundingClientRect().width ?? 0;

  const zoomBy = React.useCallback(
    (factor: (zoom: number) => number) => {
      if (!image) return;
      setCrop((c) => (c ? zoomTo(c, factor(zoomOf(c, image)), image) : c));
    },
    [image],
  );

  const moveBy = (dx: number, dy: number) => {
    if (!image) return;
    const size = viewSize();
    setCrop((c) => (c ? panBy(c, dx, dy, size, image) : c));
  };

  // A wheel listener must be non-passive to keep the page from scrolling.
  const ready = Boolean(image && crop);
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !ready) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy((z) => z * Math.exp(-e.deltaY * 0.0015));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [ready, zoomBy]);

  function spread(): number {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinchFrom.current = spread();
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const last = pointers.current.get(e.pointerId);
    if (!last) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      moveBy(e.clientX - last.x, e.clientY - last.y);
    } else if (pointers.current.size === 2) {
      const now = spread();
      const from = pinchFrom.current;
      if (from > 0 && now > 0) zoomBy((z) => (z * now) / from);
      pinchFrom.current = now;
    }
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    pinchFrom.current = pointers.current.size === 2 ? spread() : 0;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? KEY_STEP * 5 : KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      moveBy(move[0], move[1]);
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomBy((z) => z + ZOOM_STEP);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomBy((z) => z - ZOOM_STEP);
    }
  }

  const zoom = image && crop ? zoomOf(crop, image) : MIN_ZOOM;
  const another = (
    <Button type="button" variant="outline" onClick={onPickAnother}>
      Use another photo
    </Button>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        data-window-tint
        className={cn(
          "flex flex-col gap-4 sm:max-w-[600px]",
          // A phone gets the whole screen, the buttons at the bottom.
          "max-sm:inset-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-y-auto max-sm:rounded-none max-sm:border-0 max-sm:p-4",
        )}
      >
        <div className="flex flex-col gap-1 pr-6">
          {/* Montserrat, as in the approved picture, not the pixel face. */}
          <DialogTitle className="px-0 font-sans text-lg leading-6 font-bold tracking-normal normal-case sm:pl-0">
            Fit your photo
          </DialogTitle>
          <DialogDescription>
            <span className="sm:hidden">
              Drag with one finger to move the photo. Pinch, or use the slider,
              to zoom.
            </span>
            <span className="max-sm:hidden">
              Drag the photo to move it. Zoom until your face fills the circle.
            </span>
          </DialogDescription>
        </div>

        <div className="grid gap-4 sm:grid-cols-[320px_minmax(0,1fr)] sm:gap-6">
          <div className="flex flex-col gap-3">
            <div
              ref={stageRef}
              tabIndex={0}
              role="group"
              aria-label="Photo position"
              aria-describedby="photo-crop-keys"
              data-testid="photo-crop-stage"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
              onKeyDown={onKeyDown}
              className="relative aspect-square w-full cursor-grab touch-none overflow-hidden bg-[#0b0c0e] outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            >
              {src && (
                // Loads the photo once to learn its size; the frame then
                // draws it through CroppedPhoto.
                <img
                  key={src}
                  src={src}
                  alt=""
                  aria-hidden
                  className="hidden"
                  onLoad={(e) => {
                    const { naturalWidth: width, naturalHeight: height } =
                      e.currentTarget;
                    if (!width || !height) return setBroken(true);
                    const size = { width, height };
                    setImage(size);
                    setCrop(initialCrop(size));
                  }}
                  onError={() => setBroken(true)}
                />
              )}
              {src && image && crop && (
                <CroppedPhoto src={src} image={image} crop={crop} />
              )}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgba(11,12,14,0.62)] outline-2 -outline-offset-1 outline-foreground/85"
              />
              {broken && (
                <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-foreground">
                  This photo can&apos;t be opened. Try another one.
                </p>
              )}
            </div>
            <p id="photo-crop-keys" className="sr-only">
              Arrow keys move the photo. Plus and minus zoom.
            </p>

            <div className="grid grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Zoom out"
                disabled={!ready || zoom <= MIN_ZOOM + 1e-6}
                onClick={() => zoomBy((z) => z - ZOOM_STEP)}
              >
                <Minus aria-hidden />
              </Button>
              <Slider
                aria-label="Zoom"
                min={MIN_ZOOM * 100}
                max={MAX_ZOOM * 100}
                step={1}
                disabled={!ready}
                value={[Math.round(zoom * 100)]}
                onValueChange={([v]) => {
                  if (v !== undefined) zoomBy(() => v / 100);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Zoom in"
                disabled={!ready || zoom >= MAX_ZOOM - 1e-6}
                onClick={() => zoomBy((z) => z + ZOOM_STEP)}
              >
                <Plus aria-hidden />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-4 max-sm:flex-row max-sm:items-center max-sm:justify-between">
            <h3 className="text-[11px] leading-4 font-semibold tracking-[0.06em] text-muted-foreground uppercase max-sm:hidden">
              How it will look
            </h3>
            <div className="flex items-end gap-4">
              {src && image && crop ? (
                <>
                  <Preview
                    label="Your profile"
                    px={96}
                    src={src}
                    image={image}
                    crop={crop}
                  />
                  <Preview
                    label="In lists"
                    px={40}
                    src={src}
                    image={image}
                    crop={crop}
                  />
                </>
              ) : null}
            </div>
            <div className="sm:hidden">{another}</div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-border pt-4 max-sm:mt-auto max-sm:flex-col-reverse max-sm:border-t-0 max-sm:pt-0 max-sm:[&>button]:h-10 max-sm:[&>button]:w-full">
          <div className="mr-auto max-sm:hidden">{another}</div>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!crop}
            onClick={() => crop && onSave(crop)}
          >
            Save photo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
