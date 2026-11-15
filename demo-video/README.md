# Two-minute actual-gameplay demo

Status: preproduction checkpoint. Final game capture is intentionally pending the implementation chat finishing. No current scaffold is represented as a completed demo.

- `STORYLINES.md`: chosen direction and alternatives.
- `SPEC.md`: exact 120-second film contract and verification gates.
- `scripts/`: isolated phone import and gameplay capture tools.
- `captures/`: local original gameplay recordings, ignored by Git.
- `assets/phone/`: conversion exports of the user-supplied phone, never the EXR.
- `renders/`: local delivery MP4, ignored by Git.
- `REVIEW.md`: final measured and visual review (created after real footage).

Run from this directory: `npm run dev`, `npm run check`, `npm run render`. Do not render the initial scaffold as a delivery. Only video files may be staged from this chat. Git and Blender MCP operations must be coordinated with the game implementation chat.

Phone source: `/home/ripjk/Downloads/Hopes 3D Iphone/iphone_17_pro_max.usdz`. Reflection map explicitly excluded by user. Registry `vfx-iphone-device` was inspected as a rendering reference; its stock models and invented screen content are not used.
