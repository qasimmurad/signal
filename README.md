# Signal — a cobot that reads hand signs

A collaborative robot arm packs parts into boxes. You control it with your hands and a plain webcam: **✋ STOP**, **👍 GO**, **🙌 SLOW**, **☝️ GIVE ME**. The robot answers on its stack light and with a caption, and the screen shows how many milliseconds it took to obey.

Built for a deaf line operator. Useful to everyone on a loud floor.

## The person and the moment

Priya runs a packaging line. She is deaf. The plant installed a cobot beside her line to pack parts. When the arm starts a cycle at the wrong moment, a hearing colleague shouts "stop". Priya cannot. Neither can anyone else, really: the floor runs at 95 dB and the arm's voice commands never worked for anybody.

So the robot learned to read hand signs.

| sign | you | the robot |
|---|---|---|
| ✋ STOP | one flat hand toward the camera, either side | freezes where it is, stack light red, stays stopped until GO |
| 👍 GO | thumbs up | resumes the same phase of the cycle |
| 🙌 SLOW | both hands up, open, toward the camera | runs at a third of its speed, amber |
| ☝️ GIVE ME | one finger up, like "one, please" | brings you the next part, holds it out at the front of the cell until you take it, then goes back to packing |

Every sign is captioned on the cell screen, so hearing coworkers see what was said. Every STOP is timed from the first frame the hand was in the sign to the moment the tip stands still.

## Try it in sixty seconds

```bash
npm install
npm run dev
```

Open the page, press **Enable camera**, and:

1. Watch the arm pack. Raise a flat palm. It freezes, the light goes red, the caption says STOP, and a reaction time appears.
2. Thumbs up. It resumes exactly where it was.
3. Raise both hands, open. It crawls. Thumbs up again for full speed.
4. Hold one finger up. The next part the robot lifts comes to you instead of the box, and it waits with the part held out. Take it, and the robot goes back to packing.
5. Press **D** to see the live feature readout and the sign scores while you tune your hand.

No camera? **S G L H** do the same from the keyboard.

## Why this matters

- **Voice is the wrong channel on a factory floor**, for deaf workers first and for everyone second. Hand signals are already how crane crews, ground crews and divers work. Robots should read them.
- **A gesture STOP is a runtime safety monitor.** It belongs in the same layer as force limits and workspace bounds, and it needs a reaction-time number, not a promise. This prototype measures it.
- **The curb cut.** Built for one person who could not use the existing interface. Used by everyone once it exists. That is the inclusive design playbook, applied to physical AI.
- **Three brakes and one ask.** STOP, GO and SLOW make the robot safe to stand next to. GIVE ME makes it a coworker: hold out your hand and it hands you the part. Handover is also the interaction Microsoft measured in its own offloaded-inference study.

## How it works

- **Hand tracking**: MediaPipe hand landmarks in the browser, up to two hands, 21 points each per frame, nothing leaves the page.
- **Features**: the same engine as my ASL fingerspelling coach, total bend per finger, thumb position scores in a palm frame, palm normal, fingertip contacts.
- **Signs**: four soft scores in `src/signs/vocabulary.ts`, each 0 to 1, so a sign degrades gracefully instead of flickering. The last eight frames vote; STOP fires when three agree, the others when five do, so a dropped frame does not reset anything. The earliest agreeing frame is kept, so reaction time counts from when the hand was actually in the sign. Four signs, not more, because each must look nothing like the others, and all four are built from the two cues hand tracking gets right most often: which fingers are open, and whether the palm is flat to the lens. One open hand, a thumb up, two open hands, one finger up. A fist, a pinch and a palm-up hand were each tried and dropped: the fist is one finger away from a thumbs-up, the pinch depends on fine fingertip distances, and palm-up depends on the palm normal, which a single webcam estimates poorly.
- **Robot**: a 5-DOF arm with SO-101 proportions, analytic inverse kinematics, a tool that always points down, and bounded joint speed, so the tip lags the target like a real arm. The pack cycle is a state machine with three modes; STOP freezes the commanded tip, GO resumes the same phase.
- **Cell**: a tray of four parts and a box. Grasps are geometric. Full boxes ship and a new tray arrives. A handed-over part leaves the cell for good, and the rest of the tray still ships.
- **Look**: Fluent-style light surfaces, one blue accent, status tints for running, slow and stopped, so it sits naturally next to the rest of a Microsoft shop floor.

## Where it plugs into Microsoft's robotics stack

- The sign layer sits in front of whatever drives the arm. Swap the scripted cycle for a learned policy served through the Physical AI Toolchain's inference node and nothing above it changes.
- STOP and SLOW are safety-monitor inputs with measured latency, and GIVE ME is a handover request, the kind of thing the Robot Security & Safety work needs to log and prove.
- The stack light, the caption and the one-hand vocabulary are a proposal for a design language for physical AI experiences: a robot should always show what it heard.

## Honest limits

- Rules on landmarks, not a learned model. Four signs are enough to make the point and keep the behaviour explainable.
- Static shapes in decent light. Motion signs are not in the vocabulary.
- The arm is kinematic and the cell is geometric. Numbers here are about the interaction, not about grasping.
- No deaf operators have used it yet. That is the first thing to fix, before any feature.

## What is next

1. Test with three deaf or hard-of-hearing operators and rewrite the vocabulary from what they actually sign.
2. Per-operator calibration: record each sign once, tighten the scores to that hand.
3. Two-handed emergency stop and a second camera for a wider cell.
4. Run it against a real arm through the toolchain's inference node and measure reaction time end to end.
