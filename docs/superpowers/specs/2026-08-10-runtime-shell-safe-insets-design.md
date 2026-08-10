# Runtime Shell Safe Insets Design

## Goal

Keep every edge of the Directive runtime shell visible when SillyTavern is used in a short window or when browser or host scaling enlarges the interface.

## Root Cause

The desktop shell was centered with `top: 50%`, `left: 50%`, and a negative transform while also carrying fixed preferred and minimum dimensions. Scaling is applied after those dimensions are resolved. At sufficiently large scale, the transformed shell becomes wider or taller than the viewport and its top or side can leave the visible area.

The runtime overlay already mounts directly under `document.body`; SillyTavern's `#sheld` clipping boundary is not involved.

## Design

Anchor the desktop shell to all four viewport edges with a 16px safe inset. Let `width` and `height` resolve from those opposing insets, cap the preferred desktop dimensions at 940 by 900 pixels, and use auto margins to center the shell whenever extra space exists.

This preserves the established desktop size in roomy viewports. In short or scaled viewports, the inset constraints take priority, keeping the shell visible while giving its internal grid the maximum safe height. The existing mobile rule continues to replace the inset with zero and use the full dynamic viewport.

## Verification

The browser layout regression applies 125% host scaling at a constrained desktop viewport and asserts that the panel's top, right, bottom, and left edges remain inside the viewport. Existing desktop, mobile, reduced-motion, creator-control, and expanded-shell checks remain in the full alpha gate.
