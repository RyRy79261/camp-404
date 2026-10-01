import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { render } from "@testing-library/react";

// Renders a server page whose tree holds async server components (a frame
// that awaits its own reads around a section that awaits its own). jsdom's
// React cannot render an async component, so each one is awaited here, in
// place, before the tree is handed to `render`. Client components and plain
// elements pass through untouched.

function isAsync(fn: unknown): fn is (props: unknown) => Promise<ReactNode> {
  return typeof fn === "function" && fn.constructor.name === "AsyncFunction";
}

export async function resolveServerTree(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) {
    return Promise.all(node.map((child) => resolveServerTree(child)));
  }
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (isAsync(element.type)) {
    return resolveServerTree(await element.type(element.props));
  }
  if (element.props.children === undefined) return element;
  return cloneElement(
    element,
    undefined,
    await resolveServerTree(element.props.children),
  );
}

/** Await every async server component in `page`'s tree, then render it. */
export async function renderServer(page: ReactNode) {
  return render(<>{await resolveServerTree(page)}</>);
}
