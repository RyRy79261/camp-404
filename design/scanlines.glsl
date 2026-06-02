/** @resolution */
uniform vec2 u_resolution;

/** @color @default #00dcff */
uniform vec3 u_color;

void main() {
  vec2 uv = gl_FragCoord.xy;
  float scan = step(1.5, mod(uv.y, 3.0));
  float gridx = step(95.0, mod(uv.x, 96.0));
  float gridy = step(63.0, mod(uv.y, 64.0));
  float grid = max(gridx, gridy);
  float scanA = scan * 0.018;
  float gridA = grid * 0.007;
  vec3 col = grid > 0.5 ? u_color : vec3(0.0);
  float a = max(scanA, gridA);
  gl_FragColor = vec4(col, a);
}
