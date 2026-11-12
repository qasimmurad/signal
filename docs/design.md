# Signal — design

*A cobot that reads hand signs.*

## The person and the moment

Priya runs a packaging line. She is deaf. The plant just installed a collaborative arm beside the line to pack parts into boxes. When the arm starts a cycle at the wrong moment, a hearing colleague shouts "stop". Priya cannot. Neither can anyone else, really: the floor runs at 95 decibels and the arm's voice commands never worked for anybody.

## The feature

The robot reads hand signs from a plain webcam.

| sign | hand | the robot |
|---|---|---|
| STOP | one flat hand toward the camera, either side | freezes, light goes red, needs GO to resume |
| GO | thumbs up | resumes |
| SLOW | both hands up, open, toward the camera | runs at a third of its speed |
| GIVE ME | one finger up ("one, please") | brings the next part to the front of the cell and holds it out until it is taken |

Every sign is answered on the robot's stack light and as a caption on the cell screen, so hearing coworkers see what was said. Reaction time from sign to standstill is measured and shown.

## Why this, for Microsoft Robotics

- Their market is manufacturing and logistics, through Hexagon, KUKA and ABB. This is a line, a cobot and an operator.
- Their Robot Security & Safety role is about runtime safety monitors. STOP as a gesture is one.
- Their Human-Robot-AI Interaction role lists gesture and spatial input and "establishing Microsoft's design language for physical AI experiences". This is a design-language proposal with a working prototype.
- The curb cut: built for a deaf operator, used by everyone on a loud floor. That is Microsoft's own inclusive design playbook.

## What is in scope

- A kinematic 5-DOF arm with a top-down gripper, SO-101 proportions, analytic IK, bounded joint speed.
- A packing cell: a tray of four parts, a box, an endless pack cycle with a parts count.
- Sign recognition on the same feature engine as the ASL fingerspelling coach (curl per finger, thumb position scores, palm normal), with per-sign stability windows and cooldowns.
- Robot modes: running, slow, stopped, plus a pending handover.
- Stack light, captions, a shift log with reaction times, and a keyboard fallback for demos without a camera.

## Out of scope

- Learned perception. Rules on landmarks are enough for five signs and make the behaviour explainable.
- Physics. Grasps are geometric.
- Motion signs. The vocabulary is static shapes, one or two hands.
- A fist for HOLD. Tried and removed: one finger away from thumbs-up, and the pose hand tracking handles worst. Four signs that look nothing alike beat five that do not.
- Pointing at a part ("that one next"). Tried and replaced by GIVE ME: it was a quadrant picker dressed as pointing, and "pack this one first" had no business reason on a line of identical parts. A handover does.
- A pinch for SLOW and a palm-up hand for GIVE ME. Both worked in tests and failed on a real hand: fingertip distances and the palm normal are the two things a single webcam estimates worst. Replaced by two open hands and one finger up, which reuse the cues STOP and GO already prove.
