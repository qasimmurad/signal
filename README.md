# Signal — a cobot that reads hand signs

A collaborative robot arm packs parts into boxes. You control it with one hand and a plain webcam: **✋ STOP**, **✊ HOLD**, **👍 GO**, **🤏 SLOW**, **☝️ THAT ONE**. The robot answers on its stack light and with a caption, and the screen shows how many milliseconds it took to obey.

Built for a deaf line operator. Useful to everyone on a loud floor.

## The person and the moment

Priya runs a packaging line. She is deaf. The plant installed a cobot beside her line to pack parts. When the arm starts a cycle at the wrong moment, a hearing colleague shouts "stop". Priya cannot. Neither can anyone else, really: the floor runs at 95 dB and the arm's voice commands never worked for anybody.

So the robot learned to read hand signs.

| sign | you | the robot |
|---|---|---|
| ✋ STOP | flat palm toward the camera | freezes where it is, stack light red, stays stopped until GO |
| ✊ HOLD | fist | pauses in place, amber blink |
| 👍 GO | thumbs up | resumes the same phase of the cycle |
| 🤏 SLOW | thumb and index pinched | runs at a third of its speed, amber |
| ☝️ THAT ONE | point at a part on the tray | packs that part next |

Every sign is captioned on the cell screen, so hearing coworkers see what was said. Every STOP is timed from the first frame the hand was in the sign to the moment the tip stands still.

## Try it in sixty seconds

```bash
npm install
npm run dev
```

Open the page, press **Enable camera**, and:

1. Watch the arm pack. Raise a flat palm. It freezes, the light goes red, the caption says STOP, and a reaction time appears.
2. Thumbs up. It resumes exactly where it was.
3. Pinch thumb and index. It crawls. Thumbs up again for full speed.
4. Point at a part. A ring appears under it; hold the point for half a second and it is packed next.
5. Press **D** to see the live feature readout and the five sign scores while you tune your hand.

No camera? **S H G L** and **1 to 4** do the same from the keyboard.

## Why this matters

- **Voice is the wrong channel on a factory floor**, for deaf workers first and for everyone second. Hand signals are already how crane crews, ground crews and divers work. Robots should read them.
- **A gesture STOP is a runtime safety monitor.** It belongs in the same layer as force limits and workspace bounds, and it needs a reaction-time number, not a promise. This prototype measures it.
- **The curb cut.** Built for one person who could not use the existing interface. Used by everyone once it exists. That is the inclusive design playbook, applied to physical AI.

## How it works

- **Hand tracking**: MediaPipe hand landmarks in the browser, 21 points per frame, nothing leaves the page.
- **Features**: the same engine as my ASL fingerspelling coach, total bend per finger, thumb position scores in a palm frame, palm normal, fingertip contacts.
- **Signs**: five soft scores in `src/signs/vocabulary.ts`, each 0 to 1, so a sign degrades gracefully instead of flickering. A sign fires after a stability window (3 frames for STOP, 6 for the rest) and a cooldown. The first frame of the window is kept, so reaction time counts from when the hand was actually in the sign.
- **Robot**: a 5-DOF arm with SO-101 proportions, analytic inverse kinematics, a tool that always points down, and bounded joint speed, so the tip lags the target like a real arm. The pack cycle is a state machine with four modes; STOP and HOLD freeze the commanded tip, GO resumes the same phase.
- **Cell**: a tray of four parts and a box. Grasps are geometric. Full boxes ship and a new tray arrives.

## Where it plugs into Microsoft's robotics stack

- The sign layer sits in front of whatever drives the arm. Swap the scripted cycle for a learned policy served through the Physical AI Toolchain's inference node and nothing above it changes.
- STOP, HOLD and SLOW are safety-monitor inputs with measured latency, the kind of thing the Robot Security & Safety work needs to log and prove.
- The stack light, the caption and the one-hand vocabulary are a proposal for a design language for physical AI experiences: a robot should always show what it heard.

## Honest limits

- Rules on landmarks, not a learned model. Five signs are enough to make the point and keep the behaviour explainable.
- One hand, static shapes, decent light. Two-handed and motion signs are not in the vocabulary.
- The arm is kinematic and the cell is geometric. Numbers here are about the interaction, not about grasping.
- No deaf operators have used it yet. That is the first thing to fix, before any feature.

## What is next

1. Test with three deaf or hard-of-hearing operators and rewrite the vocabulary from what they actually sign.
2. Per-operator calibration: record each sign once, tighten the scores to that hand.
3. Two-handed emergency stop and a second camera for a wider cell.
4. Run it against a real arm through the toolchain's inference node and measure reaction time end to end.
