#!/usr/bin/env python3
"""Generate BODY_REGIONS from figure-relative hotspot specs."""
FIG = {
    "front": {"left": 19.8, "top": 2.5, "width": 63.2, "height": 94.0},
    "back": {"left": 15.3, "top": 2.3, "width": 63.5, "height": 94.2},
}

def fig(view, rt, rl, rw, rh):
    b = FIG[view]
    return {
        "top": round(b["top"] + rt / 100 * b["height"], 1),
        "left": round(b["left"] + rl / 100 * b["width"], 1),
        "width": round(rw / 100 * b["width"], 1),
        "height": round(rh / 100 * b["height"], 1),
    }

regions = [
    ("head-front", "Head", "Head", "front", 0, 28, 44, 11),
    ("face-front", "Face / eyes", "Face", "front", 7, 34, 32, 8),
    ("neck-front", "Neck", "Neck", "front", 13, 36, 28, 5),
    ("right-shoulder-front", "Right shoulder", "Shoulder", "front", 17, 6, 22, 8),
    ("left-shoulder-front", "Left shoulder", "Shoulder", "front", 17, 72, 22, 8),
    ("chest-front", "Chest", "Chest", "front", 21, 30, 40, 12),
    ("abdomen-front", "Abdomen", "Abdomen", "front", 33, 30, 40, 10),
    ("right-arm-front", "Right arm", "Arm", "front", 22, 0, 18, 22),
    ("left-arm-front", "Left arm", "Arm", "front", 22, 82, 18, 22),
    ("right-hand-front", "Right hand / wrist", "Hand", "front", 42, 0, 16, 10),
    ("left-hand-front", "Left hand / wrist", "Hand", "front", 42, 84, 16, 10),
    ("hips-front", "Hips / groin", "Hip", "front", 43, 28, 44, 9),
    ("right-leg-front", "Right leg", "Leg", "front", 52, 26, 22, 34),
    ("left-leg-front", "Left leg", "Leg", "front", 52, 52, 22, 34),
    ("right-foot-front", "Right foot / ankle", "Foot", "front", 86, 24, 20, 12),
    ("left-foot-front", "Left foot / ankle", "Foot", "front", 86, 56, 20, 12),
    ("head-back", "Head (back)", "Head", "back", 0, 28, 44, 11),
    ("neck-back", "Neck (back)", "Neck", "back", 13, 36, 28, 5),
    ("left-shoulder-back", "Left shoulder", "Shoulder", "back", 17, 6, 22, 8),
    ("right-shoulder-back", "Right shoulder", "Shoulder", "back", 17, 72, 22, 8),
    ("upper-back", "Upper back", "Back", "back", 21, 28, 44, 13),
    ("lower-back", "Lower back", "Back", "back", 34, 30, 40, 10),
    ("left-arm-back", "Left arm", "Arm", "back", 22, 0, 18, 22),
    ("right-arm-back", "Right arm", "Arm", "back", 22, 82, 18, 22),
    ("left-hand-back", "Left hand / wrist", "Hand", "back", 42, 0, 16, 10),
    ("right-hand-back", "Right hand / wrist", "Hand", "back", 42, 84, 16, 10),
    ("buttocks-back", "Buttocks", "Hip", "back", 44, 28, 44, 9),
    ("left-leg-back", "Left leg", "Leg", "back", 53, 26, 22, 34),
    ("right-leg-back", "Right leg", "Leg", "back", 53, 52, 22, 34),
    ("left-foot-back", "Left foot / ankle", "Foot", "back", 86, 24, 20, 12),
    ("right-foot-back", "Right foot / ankle", "Foot", "back", 86, 56, 20, 12),
]

for row in regions:
    id_, part, osha, view, rt, rl, rw, rh = row
    c = fig(view, rt, rl, rw, rh)
    print(
        f"  {{ id: \"{id_}\", part: \"{part}\", oshaPart: \"{osha}\", view: \"{view}\", "
        f"top: {c['top']}, left: {c['left']}, width: {c['width']}, height: {c['height']} }},"
    )
