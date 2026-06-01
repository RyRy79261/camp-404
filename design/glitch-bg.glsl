/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

/** @color @default #0d061e */
uniform vec3 u_base;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time;

  vec3 col = u_base;

  // Fine CRT scanlines — subtle darkening on alternating rows
  float scan = sin(gl_FragCoord.y * 3.14159) * 0.5 + 0.5;
  col *= 0.975 + 0.025 * scan;

  // Slow rolling refresh band drifting up the screen — very faint
  float roll = fract(uv.y - t * 0.07);
  float band = smoothstep(0.0, 0.05, roll) * smoothstep(0.14, 0.05, roll);
  col += band * 0.015;

  // Gentle vignette toward the edges
  vec2 d = uv - 0.5;
  float vig = 1.0 - dot(d, d) * 0.55;
  col *= vig;

  // Barely-there brightness flicker
  col *= 0.992 + 0.008 * sin(t * 6.0);

  gl_FragColor = vec4(col, 1.0);
}
