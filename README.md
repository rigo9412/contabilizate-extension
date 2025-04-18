# contabilizate-extension

A Chrome extension designed to automate form filling in the Mexican SAT (Tax Administration Service) portal, specifically for electronic invoicing (CFDI).

## Features

- Automated login using e.firma (electronic signature)
- Automated bill/invoice form filling
- Support for digital certificate management
- Automatic tax calculations and verification
- Smart form field population with saved data

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory

## Configuration

The extension requires:
- Your e.firma certificate file (.cer)
- Your e.firma private key file (.key)
- Certificate password
- Invoice information such as:
  - RFC (Tax ID)
  - Business name
  - Postal code
  - Tax regime
  - CFDI usage

## Usage

1. Click on the extension icon in Chrome
2. Configure your credentials and certificate files
3. Navigate to the SAT portal
4. Use the extension buttons to:
   - "Ir al Sitio SAT" (Go to SAT website)
   - "Iniciar Sesión (Firma)" (Login with e.firma)
   - "Llenar Factura" (Fill invoice form)

## File Structure

```
├── index.html           # Extension popup interface
├── manifest.json        # Extension configuration
├── css/                # Styles
├── js/
    ├── background.js   # Background script
    ├── popup.js        # Popup logic
    ├── forms/          # Form filling scripts
    └── utils/          # Utility functions
```

## Security

This extension stores sensitive information locally in your browser. Make sure to:
- Keep your certificate files secure
- Never share your private key
- Use strong passwords
- Only install the extension on trusted devices

## Permissions

The extension requires permissions to:
- Access SAT domains
- Access active tabs
- Execute scripts
- Access local storage
- Handle native messaging

## Development

Built with:
- JavaScript
- Chrome Extension APIs
- HTML/CSS
- Bootstrap for styling

## License

[Add your license information here]
