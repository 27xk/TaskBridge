# Product

## Register

product

## Users

TaskBridge is for people who manage personal or work tasks across a desktop computer, an Android phone, a browser, and a small desktop or home-server deployment. They need to capture work quickly, see what matters today, keep using cached tasks after an initial sync, and understand when signing in again is required before changes can reach other devices.

## Product Purpose

TaskBridge provides a local-first, self-hostable task system with desktop, Android, widget, floating-window, and static Web/PWA clients. Success means users can trust local task handling, move between devices without relearning the workflow, and distinguish local availability from authenticated online sync. Each client can retain the scoped local workspace after natural session expiry, but sending queued changes always requires signing in again.

## Brand Personality

Calm, practical, trustworthy. The interface should feel like a focused tool for repeated daily use, with direct wording and clear state feedback instead of decorative presentation.

## Anti-references

Avoid marketing-first landing-page patterns inside the product UI, including oversized hero sections, decorative card grids, novelty palettes, hidden primary actions, and workflows that force users to configure metadata before they can write a task.

## Design Principles

- Put the user's next task first: new-task flows should prioritize title and content before metadata.
- Default to today: after login and first use, the user should land where immediate work is visible.
- Hide complexity until it is useful: schedule, reminder, priority, template, repeat, and checklist controls should remain available without dominating the first screen.
- Keep destructive or secondary actions out of the main path: completion and recovery are primary list actions; editing, template use, and deletion can sit behind a secondary menu.
- Preserve self-hosting clarity: server setup and connection language should help non-developers choose the right entry point without duplicate decision trees.
- Give regular users one server URL: Release Compose clients use the shared `8080` entry; direct API and WebSocket endpoints remain an advanced deployment option.
- Keep healthy infrastructure quiet: sync panels should remain visible only when a user needs to make a decision or recover an item.
- Make installed-version and update discovery available inside each packaged client instead of requiring users to infer it from filenames.

## Accessibility & Inclusion

Aim for WCAG AA contrast for product text and controls. Keep keyboard focus visible, support reduced motion, avoid color-only status communication, and make labels meaningful in both Chinese and English UI copy.
