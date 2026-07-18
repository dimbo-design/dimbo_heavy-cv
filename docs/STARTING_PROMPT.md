# The starting prompt

The verbatim first message of this project — sent to Claude Code (Fable 5, Accept Edits mode) on July 6, 2026, before a single line of code existed. The three Russian lines on top set the working format: the prompt itself is in English, the work happens in Russian, and everything inside the project folder is pre-approved. Two reference screenshots of a depth-to-voxel demo were attached alongside (technical proof of concept only, not visual direction).

Everything below is unedited.

---

язык чата - русский
стартовый промпт сессии - на английском - продолжаем в чате на русском

сразу даю тебе аппрув на все что ты будешь в этой выделенной папке

# Portfolio site with webcam-driven 3D experience

## Project goal
Build a standalone desktop-only portfolio website for Dmitry Togulev, Product Designer. The site uses the webcam as the primary input — the camera feed drives a real-time 3D visual that makes the visitor feel the page is alive and aware of their presence. This is not a gimmick layer on top of a regular portfolio. The camera experience IS the portfolio.

Use the existing portfolio at https://github.com/dimbo-design/Dmitry-Togulev as a content source only (name, role, case studies, bio, contacts). The visual language, structure, layout, and interaction model are entirely your decision — do not replicate the existing site's aesthetic.

## Core concept: "Living Interface"
The site exists as an abstract system before anyone arrives. When the camera detects a person, the interface reorganises around their presence. The visitor doesn't trigger the site — the site notices them.

Key feeling to achieve: the visitor should think "this is magic" on first load, and "this person really knows what they're doing" after 30 seconds. The tone is "serious specialist with taste", not "quirky creative guy".

## Technical approach
The visual is based on depth estimation from the webcam feed — transform the live camera frame into a real-time 3D representation. I'm attaching reference screenshots of a "Depth Anything to 3D" voxel extrusion demo (built with Three.js + Transformers.js + WebGPU) — treat this as a technical proof of concept for the depth pipeline, NOT as a visual reference. The aesthetic, density, geometry, and behaviour of the 3D output should be entirely your own design decision.

Choose the optimal stack for this (depth model, 3D renderer, gesture layer if any) — do not wait for my input on library choices.

## Interaction principles
- The page has no traditional navigation. Content surfaces through presence and motion, not clicks on menus.
- The first meaningful interaction must happen accidentally, not by following an instruction.
- If the visitor moves, the system responds — the response should feel like the site is thinking, not reacting.
- Gesture or body-based navigation is welcome if it serves the experience naturally. Do not force it if it feels contrived.

## Hard constraints — things that must NOT exist
- No onboarding tooltips ("raise your hand to navigate", "move closer", etc.)
- No progress bars or loading spinners styled as UI elements — loading must be part of the visual
- No fallback navigation that duplicates content accessible through the camera experience
- No hover states that signal "click here"
- No section headings that label content the way a normal site would ("About", "Work", "Contact")

## Camera access handling
Camera permission is a conscious requirement of this experience — the site should communicate this as an invitation, not a warning. Design a camera permission state that feels like part of the concept, not a browser dialog wrapper.

Two degraded states to handle:
1. Mobile device detected — show a clear, well-designed message that this experience is desktop + webcam only. Not an error page, a considered dead-end.
2. Camera access denied — the site can acknowledge this gracefully but does not need to offer a full non-camera alternative.

## Content requirements
The following must be discoverable through the experience (not necessarily all at once, depth is fine):
- Who Dmitry is and what he does
- Selected case studies / work examples
- A way to get in touch

Language: bilingual Russian / English — choose whichever approach serves the experience better (toggle, auto-detect, parallel, or one primary with the other available).

## Deploy target
GitHub Pages. Single repo, clean structure. Should work without a build step if possible, or with minimal tooling.

## Autonomy
You have full autonomy on all technical and visual decisions. Proceed without asking for confirmation on stack, structure, or aesthetic choices. Build the complete working project. If you hit a genuine blocker that requires my input, flag it — otherwise ship.

---
Attached: 2 reference screenshots showing the depth-to-voxel pipeline concept (for technical reference only, not visual direction).
