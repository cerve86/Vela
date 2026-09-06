import AVFoundation
import QuartzCore
import Foundation
// clipgrad <in.mp4> <out.mp4> <start> <end> <shift src px> <top l,m,r> <floor l,m,r> <right t,m,b>
// A wide film fitted by width into a 512 square, panned left by <shift> source pixels. The
// bands around it are flat gradients in the film's own edge colours, drawn over the film's
// edges so the antialiased fringe AVFoundation leaves on a video edge never shows.
let a = CommandLine.arguments
let src = AVURLAsset(url: URL(fileURLWithPath: a[1]))
let out = URL(fileURLWithPath: a[2]); let start = Double(a[3])!; let end = Double(a[4])!
let shift = Double(a[5])!
func cols(_ s: String) -> [CGColor] { s.split(separator: ",").map { h in let v = UInt32(h, radix: 16)!; return CGColor(red: CGFloat((v >> 16) & 0xff)/255, green: CGFloat((v >> 8) & 0xff)/255, blue: CGFloat(v & 0xff)/255, alpha: 1) } }
try? FileManager.default.removeItem(at: out)
let srcTrack = src.tracks(withMediaType: .video).first!
let size = srcTrack.naturalSize
let R = 512.0, sx = R / size.width, bandH = size.height * sx, pad = (R - bandH) / 2
let range = CMTimeRange(start: CMTime(seconds: start, preferredTimescale: 600), end: CMTime(seconds: end, preferredTimescale: 600))
let comp = AVMutableComposition()
let tr = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try! tr.insertTimeRange(range, of: srcTrack, at: .zero)
let li = AVMutableVideoCompositionLayerInstruction(assetTrack: tr)
let dx = -shift * sx
li.setTransform(CGAffineTransform(scaleX: sx, y: sx).concatenating(CGAffineTransform(translationX: dx, y: pad)), at: .zero)
let vc = AVMutableVideoComposition()
vc.renderSize = CGSize(width: R, height: R)
vc.frameDuration = CMTime(value: 1, timescale: 24)
let instr = AVMutableVideoCompositionInstruction()
instr.timeRange = CMTimeRange(start: .zero, duration: comp.duration)
instr.layerInstructions = [li]
vc.instructions = [instr]
let parent = CALayer(); parent.frame = CGRect(x: 0, y: 0, width: R, height: R)
let videoLayer = CALayer(); videoLayer.frame = parent.frame
parent.addSublayer(videoLayer)
let edge = 1.5 // how far each band reaches over the film, to hide its fringe
func band(_ frame: CGRect, _ colors: [CGColor], _ from: CGPoint, _ to: CGPoint, _ locations: [NSNumber]) {
  let g = CAGradientLayer(); g.frame = frame; g.colors = colors; g.startPoint = from; g.endPoint = to; g.locations = locations
  parent.addSublayer(g)
}
let filmRight = size.width * sx + dx // where the panned film ends, in output x
let xs: [NSNumber] = [0, NSNumber(value: (640 - shift) * sx / R), NSNumber(value: (1266 - shift) * sx / R)]
// CA is y-up: the top band is at the top of the parent
band(CGRect(x: 0, y: R - pad - edge, width: R, height: pad + edge), cols(a[6]), CGPoint(x: 0, y: 0.5), CGPoint(x: 1, y: 0.5), xs)
band(CGRect(x: 0, y: 0, width: R, height: pad + edge), cols(a[7]), CGPoint(x: 0, y: 0.5), CGPoint(x: 1, y: 0.5), xs)
band(CGRect(x: filmRight - edge, y: pad, width: R - filmRight + edge, height: bandH), cols(a[8]), CGPoint(x: 0.5, y: 1), CGPoint(x: 0.5, y: 0), [0, 0.5, 1])
vc.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parent)
let export = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality)!
export.outputURL = out; export.outputFileType = .mp4
export.videoComposition = vc
let sem = DispatchSemaphore(value: 0)
export.exportAsynchronously { sem.signal() }
sem.wait()
print("\(a[2]) status \(export.status.rawValue) \(export.error?.localizedDescription ?? "")")
