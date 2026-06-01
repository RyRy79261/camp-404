/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

/** @color @default #f7ecf3 */
uniform vec3 u_base;

/** @color @default #00dcff */
uniform vec3 u_cyan;

/** @color @default #ff008c */
uniform vec3 u_magenta;

float rand(vec2 c) {
  return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time;

  vec3 col = u_base;

  // Rare, gentle per-row colour bleed — slow and infrequent
  float row = floor(uv.y * 20.0);
  float g = rand(vec2(row, floor(t * 2.5)));
  if (g > 0.95) {
    vec3 tint = rand(vec2(row, 1.0)) > 0.5 ? u_cyan : u_magenta;
    col = mix(col, tint, 0.30);
  }

  // Soft scanline on the glyphs to match the CRT background
  float scan = sin(gl_FragCoord.y * 3.14159) * 0.5 + 0.5;
  col *= 0.96 + 0.04 * scan;

  gl_FragColor = vec4(col, 1.0);
}
