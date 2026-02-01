# PPTX Export with Audio Implementation Plan

## Goal
Enable audio playback in the exported PPTX file by embedding generated audio files for each scenario.

## User Review Required
> [!NOTE]
> Audio files will only be included if they have been generated (or loaded) for the scenario at the time of export.

## Proposed Changes

### [app/page.tsx](file:///Users/kanbayashiakira/Desktop/ai-scenario-pro/app/page.tsx)

#### [MODIFY] handleExportPptx
- Inside the scenario loop (Step 3: 各シナリオ詳細):
    - Check if `s.audioUrl` exists.
    - If it exists, fetch and convert the audio blob/URL to base64 string (using `urlToBase64` or similar logic).
    - Use `p1.addMedia` to embed the audio.
    - **Positioning**: Align to the bottom-right of the image.
        - Image: `x: 0.8, y: 1.6, w: 2.8, h: 1.58`
        - Audio: `x: 3.7, y: 2.7` (To the right of the image, aligned near bottom)

## Verification Plan

### Manual Verification
1.  **Generate Audio**: In the Preview, click the speaker icon for a scenario to generate audio.
2.  **Export PPTX**: Click the PPTX export button.
3.  **Check Output**: Open the PPTX file.
    - Go to the scenario detail slide (Slide 4, 6, 8, 10).
    - Verify an audio icon appears to the right of the image.
    - Verify the audio plays correctly.
