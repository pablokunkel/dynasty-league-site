# content/

Hand-authored content that the pipeline copies into `public/data`.

## bylaws.md

Export the league bylaws Google Doc here:

1. Open the [bylaws doc](https://docs.google.com/document/d/1fvEstP18A3V0HO7AfX3LJ8hp_VpSADtpNIxyIqu1EFk/edit)
2. **File → Download → Markdown (.md)**
3. Save it in this directory as `bylaws.md`
4. Re-run `npm run data`

`/bylaws` renders it with a generated table of contents and scroll-spy. Until the
file exists, that page shows these instructions instead.
