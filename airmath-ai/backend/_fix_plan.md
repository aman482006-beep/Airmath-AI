# Fix Plan

## Problem 1: Thumbs-up gesture detection
- Relax `thumbExtended` check: in thumbs up, thumb points UP not sideways
- Relax `thumbHigh` threshold from 0.08 to 0.04
- Add a direct thumbs-up detection that doesn't depend on the general `fingerStates`

## Problem 2: OCR failure → no fallback
- When OCR produces empty or garbage text, show an overlay letting user type the equation
- Add a confirmation step after OCR so user can see/edit what was recognized
