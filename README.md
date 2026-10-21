# PiXFiX

PiXFiX is a responsive mini-project for:
- Image compression using a quality slider
- Optional width/height resizing with aspect-ratio lock
- Optional manual cropping after upload
- Before/after compression comparison slider
- Image conversion: JPG, PNG, WebP and single-frame GIF
- EXIF metadata inspection before purging
- EXIF/metadata removal for a single image
- Bulk metadata cleaning
- Responsive UI for desktop and mobile

## Important architecture note

The actual image processing happens in the browser with JavaScript and the HTML Canvas API. That is intentional: it lets the project work as a normal static website on GitHub Pages.

The included Flask backend is a lightweight backend/health endpoint for local demonstrations or a separate server deployment. GitHub Pages cannot execute Python/Flask itself.

## Run in VS Code

### Option A — easiest local run

Open the PiXFiX folder in VS Code and run:

```bash
python -m http.server 8000
```

Then open:

http://localhost:8000

This is enough for the image features.

### Option B — run the Flask backend

Create a virtual environment:

Windows:

```bash
python -m venv .venv
.venv\Scripts\activate
```

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Install:

```bash
pip install -r backend/requirements.txt
```

Run:

```bash
python backend/app.py
```

Open:

http://localhost:5000

## GitHub Pages deployment

1. Create a GitHub repository, for example `PiXFiX`.
2. Upload `index.html`, `style.css`, `app.js` and the other files.
3. In GitHub open **Settings → Pages**.
4. Under the build/deployment section choose **Deploy from a branch**.
5. Select your main branch and `/ (root)`.
6. Save.
7. GitHub will provide your Pages URL.

Because the image processing is browser-side, the public GitHub Pages version does not need the Flask backend.

## GIF note

GIF output is implemented with gif.js loaded from jsDelivr. It produces a single-frame GIF from the selected image. Animated GIF editing/conversion would require decoding and processing every frame, which is a different feature.

## Project structure

```text
PiXFiX/
├── index.html
├── style.css
├── app.js
├── README.md
└── backend/
    ├── app.py
    └── requirements.txt
```


### External browser libraries

The frontend loads `gif.js` for GIF encoding and `exifr` for reading EXIF metadata. These are loaded from jsDelivr when the page is opened.


### GIF conversion
GIF conversion uses gif.js. The encoder runs in a Web Worker. The worker file is fetched from jsDelivr and converted into a same-origin Blob URL before encoding, which avoids the common cross-origin worker failure in local development and GitHub Pages.
