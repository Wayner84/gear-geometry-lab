# Gear Geometry Lab

A lightweight web app (GitHub Pages) that generates involute spur gear + rack geometry and outputs CAD-ready dimensions.

## Features (v0.1)
- External spur gear preview (involute)
- Internal spur gear preview (ring gear)
- Rack preview
- CAD dimensions output + copy
- SVG export

## How it works
You enter:
- teeth (N)
- pitch diameter (D)
- pressure angle (φ)
- backlash
- optional addendum/dedendum overrides

The app derives:
- module: `m = D/N`
- circular pitch: `p = πm`
- addendum/dedendum (standard defaults unless overridden)
- base diameter, outside diameter, root/tip diameters

## Develop locally
Just open `index.html`.

## Notes / assumptions
- No profile shift, no helix.
- Undercut warning is a simple heuristic for no-profile-shift spur gears.

## Roadmap
- DXF export
- Profile shift / tip relief
- Meshing pair calculator (gear + rack or gear + gear)
- Printable test coupons for calibration
