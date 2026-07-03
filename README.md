# Glance for Firefox

Glance is a lightweight Firefox extension that lets you preview links in a floating split-screen panel without leaving the page. Hold Alt and click any eligible link to open it in a compact preview, then close it, expand it to a full tab, or switch to split view when you want to compare content side by side.

## Features

- Preview links in a floating panel with a built-in iframe viewer
- Use Alt+click to open previews quickly from any page
- Close, expand, or toggle split-screen mode from the preview header
- Resize and drag the preview panel to fit your workflow
- Disable the preview behavior from the extension popup when needed

## How it works

When you Alt+click a supported link, the extension injects a preview panel into the current page and loads the destination inside it. The preview is designed to feel fast and unobtrusive, while still letting you continue browsing the original page.

## Installation

1. Download or clone this repository.
2. Open Firefox and go to about:addons.
3. Click the gear icon and choose "Install Add-on From File...".
4. Select the extension folder or the generated ZIP archive.
5. Confirm the installation and enable the add-on.

## Usage

- Hold Alt and click any normal http/https link to open a preview.
- Use the buttons in the preview header to:
  - close the preview
  - open the page in a new tab
  - toggle split-screen mode
- Open the extension popup to turn the preview behavior on or off.

## Development

This project is a simple browser extension built with:

- HTML, CSS, and JavaScript
- Manifest V3
- Firefox-specific extension APIs

### Project structure

- manifest.json — extension metadata and permissions
- background.js — header rewriting logic for previewed pages
- content/content.js — preview panel behavior and link handling
- content/content.css — preview panel styling
- popup/popup.html and popup/popup.js — extension popup controls

## License

This project is licensed under the MIT License. See the LICENSE file for details.
