import ffprobeStatic from 'ffprobe-static';
import * as fs from 'fs';

console.log('ffprobe path:', ffprobeStatic.path);
if (fs.existsSync(ffprobeStatic.path)) {
    console.log('ffprobe binary found!');
} else {
    console.error('ffprobe binary NOT found!');
    process.exit(1);
}
