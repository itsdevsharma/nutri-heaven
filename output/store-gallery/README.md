# Nutri Heaven store photos

`originals/` preserves the 12 supplied photographs. `edited/` contains the AI corrected gallery versions. `input.json` maps each original to its edited version and caption.

The public gallery is on the homepage and `/shop`, linked from **Our store**. It serves responsive Cloudinary images and opens uncropped photos in a keyboard accessible dialog.

To upload the photos again and regenerate `frontend/src/store/photos.json`, run from the repository root:

```sh
node --env-file=backend/.env backend/scripts/upload-store-gallery.cjs output/store-gallery/input.json
pnpm --dir frontend build
```

Requires `CLOUDINARY_URL` in `backend/.env`, backend dependencies, and `curl`. Credentials are never included in the storefront. Upload IDs include a file hash and do not overwrite existing assets. Originals and edited versions are stored under `nutri-heaven/store-gallery` in Cloudinary.

`mobile-preview.png` and `desktop-preview.png` show the gallery at 454px and 1440px widths.
