# Mascot scenes

The Today mascot is a set of short square clips in `apps/mobile/assets/vela-mascot-poses`,
one `.mp4` and one `.png` still (the last frame) per scene. They are cut from generated
red panda films with the Swift tools here; each compiles with `swiftc -O <file> -o <tool>`.

| Tool | Use |
| --- | --- |
| `clip` | `clip <in.mp4> <out.mp4> <start> <end>` — centre-square crop of a 16:9 film, 512 px, H.264. For scenes where the panda sits inside the middle square (greeting, celebration, healthy, sit). |
| `clipgrad` | `clipgrad <in.mp4> <out.mp4> <start> <end> <zoom> <centre x> <centre y> <top l,m,r> <floor l,m,r> <right t,m,b>` — a wide scene (sleep) zoomed and centred on a source point, with flat gradient bands wherever the film does not reach, in the film's own edge colours. The bands are Core Animation layers drawn over the film's edges, because AVFoundation antialiases every video edge against black and a stretched strip of film would show a hairline. |
| `lastframe` | `lastframe <in.mp4> <out.png>` — the still. |
| `px` | `px <image.png> x y [x y …]` — sample colours, for choosing the band colours. |

The gradient colours go through the video pipeline's tone curve and come out a few units
lighter than the film. Sample the film's edge rows with `px`, export, sample the seam on the
exported still (film row against band row), subtract the difference from the inputs and
export again; two passes bring the seam within two units. The sleep scene shipped with
`clipgrad … 0.13 3.04 1.3 700 445 bdbdbd,c5c5c5,bebcb8 d8d8d8,dddbd9,e8e7e3 bcbab6,c3c1bf,e5e4e0`
(zoom 1.3, centred on the panda so it fills the round window)
(the first 0.13 s of that film is a frame of the sitting pose).
