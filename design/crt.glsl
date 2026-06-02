/** @resolution */
uniform vec2 u_resolution;

/** @color @default #0d061e */
uniform vec3 u_bg;

/** @color @default #00dcff */
uniform vec3 u_glow;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  // base background
  vec3 color = u_bg;

  // soft radial glow toward the upper-center
  vec2 c = uv - vec2(0.5, 0.42);
  c.x *= u_resolution.x / u_resolution.y;
  float d = length(c);
  float glow = smoothstep(0.65, 0.0, d) * 0.18;
  color = mix(color, u_glow, glow);

  // vignette darkening at the edges
  float vig = smoothstep(1.05, 0.35, length(uv - 0.5));
  color *= mix(0.55, 1.0, vig);

  // horizontal CRT scanlines
  float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 1.6);
  color *= 1.0 - 0.10 * scan;

  // faint vertical aperture grille
  float grille = 0.5 + 0.5 * sin(gl_FragCoord.x * 3.14159);
  color *= 1.0 - 0.04 * grille;

  gl_FragColor = vec4(color, 1.0);
}
