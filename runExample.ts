import path from "path";
import {analyzeUsage} from "./index";

void (async (dir) => {
    let outputName = 'events';

    let usageTarget = path.join(dir, 'example', 'events.ts');

    const exceptions = [
        'module3.ts',
    ]
    await analyzeUsage(usageTarget, dir, exceptions, outputName);
})(__dirname)