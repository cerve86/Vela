import AVFoundation
import QuartzCore
import Foundation
// clipgrad <in.mp4> <out.mp4> <start> <end> <zoom> <centre x> <centre y> <top l,m,r> <floor l,m,r> <right t,m,b>
// zoom 1 fits the film by width; the source point (centre x, centre y) lands at the middle of the square.
// A wide film fitted by width into a 512 square, panned left by <shift> source pixels. The
// bands around it are flat gradients in the film's own edge colours, drawn over the film's
// edges so the antialiased fringe AVFoundation leaves on a video edge never shows.
let a = CommandLine.arguments
let src = AVURLAsset(url: URL(fileURLWithPath: a[1]))
let out = URL(fileURLWithPath: a[2]); let start = Double(a[3])!; let end = Double(a[4])!
let zoom = Double(a[5])!, cx = Double(a[6])!, cy = Double(a[7])!
func cols(_ s: String) -> [CGColor] { s.split(separator: ",").map { h in let v = UInt32(h, radix: 16)!; return CGColor(red: CGFloat((v >> 16) & 0xff)/255, green: CGFloat((v >> 8) & 0xff)/255, blue: CGFloat(v & 0xff)/255, alpha: 1) } }
try? FileManager.default.removeItem(at: out)
let srcTrack = src.tracks(withMediaType: .video).first!
let size = srcTrack.naturalSize
let R = 512.0, sx = R / size.width * zoom, bandH = size.height * sx
let dx = R / 2 - cx * sx, dy = R / 2 - cy * sx
let range = CMTimeRange(start: CMTime(seconds: start, preferredTimescale: 600), end: CMTime(seconds: end, preferredTimescale: 600))
let comp = AVMutableComposition()
let tr = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try! tr.insertTimeRange(range, of: srcTrack, at: .zero)
let li = AVMutableVideoCompositionLayerInstruction(assetTrack: tr)
li.setTransform(CGAffineTransform(scaleX: sx, y: sx).concatenating(CGAffineTransform(translationX: dx, y: dy)), at: .zero)
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
let filmRight = size.width * sx + dx // where the film ends, in output x
let filmBottom = dy + bandH
func loc(_ x: Double) -> NSNumber { NSNumber(value: max(0, min(1, (x * sx + dx) / R))) }
let xs: [NSNumber] = [loc(117), loc(640), loc(1266)]
// CA is y-up: the top band is at the top of the parent
if dy > 0 { band(CGRect(x: 0, y: R - dy - edge, width: R, height: dy + edge), cols(a[8]), CGPoint(x: 0, y: 0.5), CGPoint(x: 1, y: 0.5), xs) }
if filmBottom < R { band(CGRect(x: 0, y: 0, width: R, height: R - filmBottom + edge), cols(a[9]), CGPoint(x: 0, y: 0.5), CGPoint(x: 1, y: 0.5), xs) }
if filmRight < R { band(CGRect(x: filmRight - edge, y: max(0, R - filmBottom), width: R - filmRight + edge, height: bandH), cols(a[10]), CGPoint(x: 0.5, y: 1), CGPoint(x: 0.5, y: 0), [0, 0.5, 1]) }
vc.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parent)
let export = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality)!
export.outputURL = out; export.outputFileType = .mp4
export.videoComposition = vc
let sem = DispatchSemaphore(value: 0)
export.exportAsynchronously { sem.signal() }
sem.wait()
print("\(a[2]) status \(export.status.rawValue) \(export.error?.localizedDescription ?? "")")
