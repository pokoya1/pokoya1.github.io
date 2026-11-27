"""Convert a saved WebM recording to a widely playable H.264 MP4; FFmpeg required."""
import argparse, subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);args=p.parse_args()
if args.output.suffix.lower() != '.mp4' or args.source.resolve()==args.output.resolve():p.error('Specify a different .mp4 output path.')
subprocess.run(['ffmpeg','-n','-i',str(args.source),'-map','0:v:0','-an','-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-movflags','+faststart',str(args.output)],check=True)
