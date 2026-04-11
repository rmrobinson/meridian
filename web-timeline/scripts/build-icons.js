#!/usr/bin/env node

/**
 * build-icons.js — Extract and convert MDI SVGs to PNG format.
 *
 * Reads SVG icons from node_modules/@mdi/svg/svg/ and converts them to 32x32
 * PNG files in public/icons/, enabling dual SVG (timeline) + PNG (cards) icon support.
 *
 * Usage: node scripts/build-icons.js
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MDI_SVG_DIR = path.join(__dirname, '../node_modules/@mdi/svg/svg');
const OUTPUT_DIR = path.join(__dirname, '../app/public/icons');
const ICON_SIZE = 32;

async function buildIcons() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Read all SVG files from MDI
  const files = fs.readdirSync(MDI_SVG_DIR);
  const svgFiles = files.filter(f => f.endsWith('.svg'));

  console.log(`Found ${svgFiles.length} MDI icons. Converting to PNG...`);

  let converted = 0;
  let failed = 0;

  for (const file of svgFiles) {
    try {
      const svgPath = path.join(MDI_SVG_DIR, file);
      const pngName = file.replace('.svg', '.png');
      const pngPath = path.join(OUTPUT_DIR, pngName);
      const darkPngName = file.replace('.svg', '-dark.png');
      const darkPngPath = path.join(OUTPUT_DIR, darkPngName);

      // Read SVG content
      let svgContent = fs.readFileSync(svgPath, 'utf8');

      // For light mode: add fill directly to each path
      const blackSvgContent = svgContent
        .replace(/<path\s+d=/g, '<path fill="#000000" d=');

      // For dark mode: same but we'll render with white background and invert
      const darkModeSvgContent = svgContent
        .replace(/<svg([^>]*)>/, '<svg$1><rect width="24" height="24" fill="#ffffff"/>')
        .replace(/<path\s+d=/g, '<path fill="#000000" d=');

      // Create temporary SVG files with unique names to avoid conflicts
      const uniqueId = Math.random().toString(36).substring(7);
      const tempBlackSvgPath = path.join(OUTPUT_DIR, `.temp-black-${uniqueId}.svg`);
      const tempDarkSvgPath = path.join(OUTPUT_DIR, `.temp-dark-${uniqueId}.svg`);
      fs.writeFileSync(tempBlackSvgPath, blackSvgContent);
      fs.writeFileSync(tempDarkSvgPath, darkModeSvgContent);

      await sharp(tempBlackSvgPath)
        .png()
        .resize(ICON_SIZE, ICON_SIZE, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }, // transparent background
        })
        .toFile(pngPath);

      // For dark mode: render black on white, then convert white background to transparent, then invert
      const darkModeBuffer = await sharp(tempDarkSvgPath)
        .png()
        .resize(ICON_SIZE, ICON_SIZE, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 255 }, // opaque white background
        })
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Process the raw buffer to make white transparent and invert dark pixels to white
      const { data, info } = darkModeBuffer;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        // Calculate brightness (average of RGB)
        const brightness = (r + g + b) / 3;

        // If pixel is bright (background), make it transparent
        if (brightness > 200) {
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 0;
        } else {
          // Otherwise, invert to make dark pixels bright
          data[i] = 255 - r;
          data[i + 1] = 255 - g;
          data[i + 2] = 255 - b;
          // Keep alpha as-is
        }
      }

      await sharp(data, {
        raw: {
          width: info.width,
          height: info.height,
          channels: info.channels
        }
      })
        .png()
        .toFile(darkPngPath);

      // Clean up temp files
      fs.unlinkSync(tempBlackSvgPath);
      fs.unlinkSync(tempDarkSvgPath);

      converted++;

      // Progress report every 100 icons
      if (converted % 100 === 0) {
        console.log(`  Converted ${converted}/${svgFiles.length} icons...`);
      }
    } catch (err) {
      failed++;
      console.error(`  Failed to convert ${file}: ${err.message}`);
    }
  }

  console.log(`\n✓ Conversion complete: ${converted} icons, ${failed} failed`);
}

buildIcons().catch(err => {
  console.error('Icon build failed:', err);
  process.exit(1);
});
