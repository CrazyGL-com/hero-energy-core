<sub>*Hero made by [@ybouane](https://x.com/ybouane).*</sub>
<p align="center">
  <img src="https://crazygl.com/heroes/hero-energy-core/banner-full.png" alt="Energy Core Reactor" width="640">
</p>

# @crazygl/hero-energy-core

A glowing reactor core suspended in space — rotating orbital rings, procedural plasma arcs lashing inward, and emissive bloom.

## Demo
[Energy Core Reactor](https://crazygl.com/hero/energy-core)

## Install

```bash
npm install @crazygl/hero-energy-core
```

## Usage

```tsx
import EnergyCore from '@crazygl/hero-energy-core';

export default function Page() {
  return (
    <EnergyCore
      heading="Reactor."
      coreSize={0.12}
      rotationSpeed={1}
      bloomStrength={1}
    />
  );
}
```

## Customise

- **Layout** — `centerX` slides the reactor across the frame (−0.6…0.6; 0 = centred).
- **Core** — `coreColor`, `innerColor`, `coreSize`, `coreIntensity` shape the hot sphere; `ringColor` / `ringIntensity` and `plasmaColor` / `plasmaIntensity` drive the orbital bands and arcs.
- **Glow & motion** — `bloomStrength` lifts highlights into a halo; `rotationSpeed` multiplies all three ring rates.
- **Background** — `bgColor` sets the deep-space backdrop, or flip `transparent` to drop the star field and composite over your own page background.

## Best for

- Sci-fi, game-studio, and deep-tech landing pages
- AI / ML platforms wanting a powerful "engine" metaphor
- Fusion, energy, and climate-tech brands
- Compute-infrastructure sites with a futuristic streak



This hero is part of [CrazyGL](https://crazygl.com), a collection of production-ready WebGL, canvas, 3D, and typography effects. Every CrazyGL hero ships with an agent-ready `SKILL.md` file that helps developers and coding agents adapt the effect into custom landing pages and interactive experiences.
