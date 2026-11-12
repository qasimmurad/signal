# Nudge — design

*A shared-autonomy console for correcting a robot policy from a webcam, where every correction becomes labelled training data.*

## Why this exists

Microsoft Robotics (inside Microsoft Discovery and Quantum) is building "a platform for physical intelligence that brings together humans, robots, and agents". The pieces that are public as of November 2026:

- **Rho-alpha** (Jan 2026): a Phi-derived vision-language-action model for bimanual manipulation with tactile sensing. Its headline demo is a robot failing a plug insertion, a human nudging it back on track with a 3D mouse, and the stated goal of learning from those corrections during deployment.
- **BusyBox**: a 3D-printable panel of buttons, a knob, sliders, switches and wires used to test whether a policy generalises affordances. Even strong open models (π0.5, GR00T N1.6) struggle when the modules are rearranged.
- **Physical AI Toolchain** (open source): ROS 2 capture on Jetson, LeRobot conversion, training on Azure ML, Isaac Lab RL, evaluation dashboards, GitOps rollout, GPU offload. Its "T5 Operate / fleet intelligence" tier is on the roadmap and not built.
- **Open roles**: the Human-Robot-AI Interaction role lists natural-language task instruction, shared autonomy control panels, intent and status displays, trust calibration and gesture input.

## The gap Nudge goes after

1. **Correction data is the scarce input and the current loop is expensive.** It needs an expert at a 3D mouse, next to a physical robot, on a Jetson + ROS 2 + Azure stack that the toolchain itself says is "not for desktop demos (yet)". Rho-alpha's continual learning only works if corrections are plentiful.
2. **Corrections are not legible.** A teleop trace says *what* the human did, not *why*. Without the "why", a correction is weak training data and no evaluation signal at all.
3. **Trust is asserted, not measured.** The Rho-alpha page says adaptive robots "will be more trusted". Evaluation so far is qualitative. Nothing public turns intervention data into an autonomy decision.

## The workaround

- **Make correction cheap:** a browser and a webcam. Pinch to take the gripper, move your hand to move it, let go to hand control back. No 3D mouse, no robot on the desk. The same console drives a simulator today and a real arm through the toolchain's inference node later.
- **Make correction legible:** every intervention is logged with the policy's stated intent, its reported confidence, what the human changed, and the outcome, then auto-labelled in language ("policy was pressing yellow; human moved the gripper 5 cm left and pressed red; failure: wrong target"). The export is LeRobot-shaped so it can feed training.
- **Make trust measurable:** per task, the console tracks autonomous success rate, intervention rate, time-to-recovery and confidence calibration, and recommends an autonomy level: autonomous, supervised or teleop. That is the "Operate" surface the toolchain roadmap describes.
- **Make the webcam a safety sensor too:** a hand close to the camera without a pinch means a person is in the zone, so the arm slows. Risky steps wait for approval.

## What is in scope for v1

- A kinematic 5-DOF arm in the browser (SO-101 proportions) with analytic IK and joint speed limits.
- A BusyBox-style panel: four lit buttons, a toggle switch, a six-position knob, a slider.
- A scripted policy that executes tasks and fails in realistic, injectable ways: wrong target (affordance confusion), drift, stall, overshoot. It reports intent and confidence; confidence is deliberately miscalibrated on some failure modes so the calibration readout has something to show.
- Shared autonomy: pinch-to-take-over from the webcam, keyboard fallback, automatic handback with replanning.
- Natural-language instructions parsed into a task queue with approval thresholds.
- Episode recorder with language labels and a LeRobot-shaped JSON export.
- Trust panel with autonomy recommendations.

## Out of scope for v1

- A learned policy. The point is the product surface around one, not the model.
- Physics. Contacts are geometric.
- Cloud. Everything runs in the browser; nothing leaves it.
