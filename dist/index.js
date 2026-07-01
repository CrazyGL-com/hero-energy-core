import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import * as React from 'react';
import CrazyGLWrapper, { useContent, useHeroAnimationFrame, useHeroReady } from '@crazygl/core';
import metadata from './metadata.json';
import './style.css';
/* ─────────────────────────────────────────────────────────────────────────
   Energy Core Reactor — emissive sci-fi reactor.

   Physics statement
     A bright spherical core (Gaussian halo + hot inner sphere) at screen
     centre. Three orbital RINGS at slightly tilted ellipses, each with
     their own rotation speed, glow as bright thin bands. PLASMA ARCS:
     procedural lightning paths that connect the core's surface to nearby
     points on the rings, drawn as series of Gaussian segments warped by
     FBM noise (so the path looks like a jagged electric arc).  Bloom
     re-adds the brightest parts as a wider halo.

   Algorithm
     - Core: pow(distFromCentre, large) reversed → bright disk.
     - Rings: ellipse SDF, distance to ring path → narrow Gaussian band.
       Tilt achieved via 2D scale on Y.
     - Plasma: for K arcs, parametrise a path P(t) from core to a point
       on a ring; perturb perpendicular by FBM noise to create jaggedness;
       draw as Gaussian along the perturbed path.
     - Star field background.
     - Bloom: add (lum^4) * 0.2 back to lift highlights.

   Coordinate spaces
     fragUV — aspect-corrected centred [-aspect/2..aspect/2] × [-0.5..0.5]
   ───────────────────────────────────────────────────────────────────────── */
const VERT = `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;
const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  u_resolution;
uniform float u_time;
uniform vec2  u_input;
uniform float u_inputActive;

uniform vec3  u_core;
uniform vec3  u_inner;
uniform vec3  u_ring;
uniform vec3  u_plasma;
uniform vec3  u_bg;

uniform float u_coreSize;
uniform float u_coreIntensity;
uniform float u_ringIntensity;
uniform float u_plasmaIntensity;
uniform float u_bloom;
uniform float u_rotation;
uniform float u_centerX;
uniform float u_transparent;

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}
float vNoise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash21(i), hash21(i + vec2(1,0)), u.x),
	           mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), u.x), u.y);
}

uint pcg(uvec2 v) {
	v = v * 1664525u + 1013904223u;
	v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= (v >> 16u);
	v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= (v >> 16u);
	return v.x;
}

void main() {
	vec2 res = u_resolution;
	vec2 fragUV = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);

	// Background star field. Skipped in transparent mode — the core,
	// rings, and plasma are the actual subject; stars are decorative.
	vec3 col = (u_transparent > 0.5) ? vec3(0.0) : u_bg;
	{
		vec2 b = floor(gl_FragCoord.xy * 0.7);
		float s = float(pcg(uvec2(b))) * (1.0 / 4294967295.0);
		float bright = step(0.997, s);
		col += vec3(0.94, 0.97, 1.0) * bright * 0.6;
	}

	// Reactor centre = configurable horizontal offset + slight pointer
	// parallax. fragUV-relative coords → fromCentre is what every effect
	// is centred on.
	vec2 centre = vec2(u_centerX, 0.0);
	if (u_inputActive > 0.5) {
		centre += (u_input - 0.5) * 0.05;
	}
	vec2 c = fragUV - centre;
	float r = length(c);

	// CORE — bright sphere with hot inner.
	float coreOuter = exp(-pow(r / max(u_coreSize, 0.001), 2.0));
	float coreInner = exp(-pow(r / max(u_coreSize * 0.55, 0.001), 2.0));
	col += u_core * coreOuter * u_coreIntensity * 0.85;
	col += u_inner * coreInner * u_coreIntensity * 1.4;

	// RINGS — three concentric ellipses. Y squashed for tilt.
	float t = u_time * u_rotation;
	for (int i = 0; i < 3; i++) {
		float fi = float(i);
		float ringR = u_coreSize * (3.0 + fi * 1.6);
		float tilt = 0.45 + fi * 0.10;             // Y squash for perspective
		float rotAng = t * (0.6 - fi * 0.18) + fi * 1.0;
		float ca = cos(rotAng), sa = sin(rotAng);
		// Rotate ring's local frame to apply per-ring inclination.
		vec2 q = mat2(ca, -sa, sa, ca) * c;
		float dist = length(vec2(q.x, q.y / max(tilt, 0.01))) - ringR;
		float ringW = 0.005;
		float band = exp(-pow(dist / ringW, 2.0));
		// Modulate around the ring so it has bright "knot" sections.
		float ang = atan(q.y, q.x);
		float mod_ = 0.4 + 0.6 * pow(0.5 + 0.5 * sin(ang * 6.0 + t * (1.5 + fi)), 4.0);
		col += u_ring * band * mod_ * u_ringIntensity * 0.8;
	}

	// PLASMA ARCS — six arcs leaping from points on the unit-2 ring back
	// to the core. Each arc is a path that we sample distance to, with
	// FBM-perturbed jaggedness.
	const int N_ARCS = 6;
	for (int i = 0; i < N_ARCS; i++) {
		float fi = float(i);
		// Anchor on the orbit of ring 1.
		float ringR = u_coreSize * 4.6;
		float tilt = 0.5;
		float rotAng = t * 0.42 + fi * 6.2831853 / float(N_ARCS);
		vec2 anchor = vec2(cos(rotAng), sin(rotAng) * tilt) * ringR;
		// Param along arc from core (a=0) to anchor (a=1).
		// Distance to the line segment.
		vec2 v = anchor;
		float a = clamp(dot(c, v) / max(dot(v, v), 1e-6), 0.0, 1.0);
		vec2 line = v * a;
		vec2 perp = vec2(-v.y, v.x) / max(length(v), 1e-6);
		// Jaggedness: perpendicular displacement varying along the arc.
		float n = vNoise(vec2(a * 12.0 + fi * 7.0, t * 4.0));
		float jag = (n - 0.5) * 0.045;
		vec2 arcPoint = line + perp * jag;
		float arcD = length(c - arcPoint);
		// Gaussian width tapering toward the core (thin) and anchor (medium).
		float aWidth = mix(0.005, 0.012, a);
		float arc = exp(-pow(arcD / aWidth, 2.0));
		// Flicker per arc.
		float flicker = 0.4 + 0.6 * pow(0.5 + 0.5 * sin(t * (5.0 + fi * 0.7) + fi), 2.0);
		col += u_plasma * arc * flicker * u_plasmaIntensity * 0.85;
	}

	// Bloom — re-add bright parts as a soft halo.
	float lum = dot(col, vec3(0.299, 0.587, 0.114));
	col += vec3(1.0) * pow(lum, 4.0) * 0.18 * u_bloom;

	// Vignette + grain. Both skipped in transparent mode: the vignette
	// only darkens the bg (which isn't there), and the grain would
	// paint a faint static field over the user's page bg.
	if (u_transparent < 0.5) {
		float rr = length(fragUV);
		col *= 1.0 - smoothstep(0.6, 1.4, rr) * 0.45;
		uvec2 g = uvec2(gl_FragCoord.xy) ^ uvec2(uint(u_time * 71.41));
		g = g * 1664525u + 1013904223u; g ^= (g >> 16u);
		col += (float(g.x & 0xFFu) / 255.0 - 0.5) * 0.012;
	}

	// In transparent mode we derive alpha from the foreground luminance
	// — the brightest fragments (core, ring knots, plasma arcs) become
	// fully opaque; dark fragments fade to the page bg.
	float alpha = 1.0;
	if (u_transparent > 0.5) {
		alpha = clamp(max(max(col.r, col.g), col.b) * 1.6, 0.0, 1.0);
	}

	outColor = vec4(clamp(col, 0.0, 1.0), alpha);
}`;
function parseHex(hex) {
    const h = hex.replace('#', '');
    const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(f, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function compile(gl, t, s) {
    const sh = gl.createShader(t);
    gl.shaderSource(sh, s);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('[energy-core]', gl.getShaderInfoLog(sh));
        throw new Error('compile');
    }
    return sh;
}
function EnergyCoreHero(props) {
    const { size, input, reducedMotion, coreColor = '#ffd17a', innerColor = '#ffffff', ringColor = '#5cf0ff', plasmaColor = '#a26cff', bgColor = '#03020a', coreSize = 0.12, coreIntensity = 1.4, ringIntensity = 1, plasmaIntensity = 1, bloomStrength = 1, rotationSpeed = 1, centerX = 0, transparent = false, } = props;
    const content = useContent(props);
    useHeroReady(props);
    const canvasRef = React.useRef(null);
    const glRef = React.useRef(null);
    const programRef = React.useRef(null);
    const uRef = React.useRef({});
    React.useEffect(() => {
        const c = canvasRef.current;
        if (!c)
            return;
        const gl = c.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: false });
        if (!gl)
            return;
        glRef.current = gl;
        try {
            const p = gl.createProgram();
            gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
            gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FRAG));
            gl.linkProgram(p);
            if (!gl.getProgramParameter(p, gl.LINK_STATUS))
                throw new Error('link');
            programRef.current = p;
            const buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            const loc = gl.getAttribLocation(p, 'a_position');
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
            for (const n of ['u_resolution', 'u_time', 'u_input', 'u_inputActive', 'u_core', 'u_inner', 'u_ring', 'u_plasma', 'u_bg', 'u_coreSize', 'u_coreIntensity', 'u_ringIntensity', 'u_plasmaIntensity', 'u_bloom', 'u_rotation', 'u_centerX', 'u_transparent']) {
                uRef.current[n] = gl.getUniformLocation(p, n);
            }
            gl.useProgram(p);
        }
        catch { }
    }, []);
    React.useEffect(() => {
        const c = canvasRef.current, gl = glRef.current;
        if (!c || !gl)
            return;
        const dpr = Math.min(size.dpr, 2);
        const w = Math.max(1, Math.floor(size.width * dpr)), h = Math.max(1, Math.floor(size.height * dpr));
        if (c.width !== w)
            c.width = w;
        if (c.height !== h)
            c.height = h;
        gl.viewport(0, 0, w, h);
    }, [size.width, size.height, size.dpr]);
    const eff = reducedMotion ? 0 : rotationSpeed;
    useHeroAnimationFrame(props.rootRef, ({ elapsed }) => {
        const gl = glRef.current, p = programRef.current, c = canvasRef.current;
        if (!gl || !p || !c)
            return;
        const u = uRef.current;
        const [coR, coG, coB] = parseHex(coreColor);
        const [inR, inG, inB] = parseHex(innerColor);
        const [riR, riG, riB] = parseHex(ringColor);
        const [plR, plG, plB] = parseHex(plasmaColor);
        const [bR, bG, bB] = parseHex(bgColor);
        gl.uniform2f(u.u_resolution, c.width, c.height);
        gl.uniform1f(u.u_time, elapsed);
        gl.uniform2f(u.u_input, input.x, 1 - input.y);
        gl.uniform1f(u.u_inputActive, input.active ? 1 : 0);
        gl.uniform3f(u.u_core, coR, coG, coB);
        gl.uniform3f(u.u_inner, inR, inG, inB);
        gl.uniform3f(u.u_ring, riR, riG, riB);
        gl.uniform3f(u.u_plasma, plR, plG, plB);
        gl.uniform3f(u.u_bg, bR, bG, bB);
        gl.uniform1f(u.u_coreSize, coreSize);
        gl.uniform1f(u.u_coreIntensity, coreIntensity);
        gl.uniform1f(u.u_ringIntensity, ringIntensity);
        gl.uniform1f(u.u_plasmaIntensity, plasmaIntensity);
        gl.uniform1f(u.u_bloom, bloomStrength);
        gl.uniform1f(u.u_rotation, eff);
        gl.uniform1f(u.u_centerX, centerX);
        gl.uniform1f(u.u_transparent, transparent ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    return (_jsxs(_Fragment, { children: [_jsx("crazygl-stage", { style: { background: transparent ? 'transparent' : bgColor }, children: _jsx("canvas", { ref: canvasRef, className: "crazygl-core-canvas", "aria-hidden": "true" }) }), _jsx("crazygl-content", { children: content.node })] }));
}
export default function EnergyCore(props) {
    return _jsx(CrazyGLWrapper, { hero: EnergyCoreHero, metadata: metadata, ...props });
}
export { metadata };
