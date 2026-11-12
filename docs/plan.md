# Nudge — implementation plan

Small commits, one concern each, in this order.

1. **Scaffold**: Vite + TypeScript, three.js, MediaPipe hands. Copy the camera, tracker and landmark helpers from vision-skill-coach.
2. **Arm**: 5-DOF kinematics with analytic IK (yaw, shoulder, elbow, wrist pitch keeps the tool level), reach clamp, joint speed limits. Tests: FK∘IK round trip, unreachable targets clamp.
3. **Panel**: BusyBox-style modules and their affordance state. Contact rules driven by the tool tip.
4. **Scene**: three.js rendering of arm, panel, workspace bounds, target ghost coloured by who is driving.
5. **Policy**: task library, waypoint plans, injectable failure modes, intent + confidence reporting.
6. **Shared autonomy**: pinch takeover with clutch-style relative control, keyboard fallback, handback + replan, human-in-zone slow mode.
7. **Agent**: instruction parsing into a task queue, risk scores, approval gate.
8. **Recorder**: episodes, intervention events, language labels, LeRobot-shaped export.
9. **Trust**: per-task stats, calibration gap, autonomy recommendation.
10. **HUD**: intent card, instruction box, mode banner, safety strip, trust table, episode log.
11. **README**: one-page PRD and demo script.
