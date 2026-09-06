import AVFoundation
import AppKit
// lastframe <in.mp4> <out.png>
let a = CommandLine.arguments
let asset = AVURLAsset(url: URL(fileURLWithPath: a[1]))
let gen = AVAssetImageGenerator(asset: asset)
gen.requestedTimeToleranceBefore = CMTime(value: 1, timescale: 24); gen.requestedTimeToleranceAfter = .zero
let t = CMTimeSubtract(asset.duration, CMTime(value: 1, timescale: 48))
let cg = try! gen.copyCGImage(at: t, actualTime: nil)
let rep = NSBitmapImageRep(cgImage: cg)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[2]))
print("still at \(CMTimeGetSeconds(t))s \(cg.width)x\(cg.height)")
