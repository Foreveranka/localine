import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../",import.meta.url));
execFileSync("python3",["-c",`from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from shutil import copyfile
root=Path(${JSON.stringify(root)})
files=['manifest.json','popup.html','popup.css','popup.js','payment-request.mjs']
with ZipFile(root/'public/monad-checkout-extension.zip','w',ZIP_DEFLATED) as archive:
 for name in files: archive.write(root/'extension'/name, name)
if (root/'website').is_dir():
 (root/'website/downloads').mkdir(exist_ok=True)
 copyfile(root/'public/monad-checkout-extension.zip',root/'website/downloads/localine-extension.zip')
print('Packaged checkout reader extension: 5 files')
`],{stdio:"inherit"});
