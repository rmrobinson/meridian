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

      // Convert SVG to PNG using sharp
      await sharp(svgPath)
        .png()
        .resize(ICON_SIZE, ICON_SIZE, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }, // transparent background
        })
        .toFile(pngPath);

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
