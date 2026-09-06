import AVFoundation
import Foundation
// clip <in.mp4> <out.mp4> <start> <end>  — centre-square crop, scaled to 512, H.264
let a = CommandLine.arguments
let asset = AVURLAsset(url: URL(fileURLWithPath: a[1]))
let out = URL(fileURLWithPath: a[2]); let start = Double(a[3])!; let end = Double(a[4])!
try? FileManager.default.removeItem(at: out)
let track = asset.tracks(withMediaType: .video).first!
let size = track.naturalSize
let side = min(size.width, size.height)
let scale = 512.0 / side
let comp = AVMutableVideoComposition()
comp.renderSize = CGSize(width: 512, height: 512)
comp.frameDuration = CMTime(value: 1, timescale: 24)
let instr = AVMutableVideoCompositionInstruction()
instr.timeRange = CMTimeRange(start: .zero, duration: asset.duration)
let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
let tx = -(size.width - side) / 2 * scale
let ty = -(size.height - side) / 2 * scale
layer.setTransform(CGAffineTransform(scaleX: scale, y: scale).concatenating(CGAffineTransform(translationX: tx, y: ty)), at: .zero)
instr.layerInstructions = [layer]
comp.instructions = [instr]
let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHighestQuality)!
export.outputURL = out; export.outputFileType = .mp4
export.videoComposition = comp
export.timeRange = CMTimeRange(start: CMTime(seconds: start, preferredTimescale: 600), end: CMTime(seconds: end, preferredTimescale: 600))
let sem = DispatchSemaphore(value: 0)
export.exportAsynchronously { sem.signal() }
sem.wait()
print("\(a[2]) status \(export.status.rawValue) \(export.error?.localizedDescription ?? "")")
