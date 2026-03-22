class FileHandler {
    constructor() {
        this.xmlFiles = [];
        this.pdfFiles = [];
        this.xmlZip = null;
        this.pdfZip = null;
    }

    addXmlFile(fileData) {
        this.xmlFiles.push(fileData);
    }

    addPdfFile(fileData) {
        this.pdfFiles.push(fileData);
    }

    async createXmlZip() {
        if (this.xmlFiles.length === 0) {
            throw new Error('No hay archivos XML para comprimir');
        }

        this.xmlZip = new JSZip();
        
        // Add XML files to ZIP
        for (const file of this.xmlFiles) {
            try {
                // Get the actual file content
                const fileContent = await this.getFileContent(file.url, 'xml');
                this.xmlZip.file(file.filename, fileContent);
            } catch (error) {
                console.error(`Error adding XML file ${file.filename}:`, error);
            }
        }

        // Generate ZIP blob
        const zipBlob = await this.xmlZip.generateAsync({ type: 'blob' });
        return zipBlob;
    }

    async createPdfZip() {
        if (this.pdfFiles.length === 0) {
            throw new Error('No hay archivos PDF para comprimir');
        }

        this.pdfZip = new JSZip();
        
        // Add PDF files to ZIP
        for (const file of this.pdfFiles) {
            try {
                // Get the actual file content
                const fileContent = await this.getFileContent(file.url, 'pdf');
                this.pdfZip.file(file.filename, fileContent);
            } catch (error) {
                console.error(`Error adding PDF file ${file.filename}:`, error);
            }
        }

        // Generate ZIP blob
        const zipBlob = await this.pdfZip.generateAsync({ type: 'blob' });
        return zipBlob;
    }

    async getFileContent(url, fileType) {
        return new Promise((resolve, reject) => {
            // For XML files, we can fetch directly
            if (fileType === 'xml') {
                fetch(`RecuperaCfdi.aspx?Datos=${url}`)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        return response.text();
                    })
                    .then(content => resolve(content))
                    .catch(error => reject(error));
            } else {
                // For PDF files, we need to handle them differently
                // This is a placeholder - PDF handling might require different approach
                reject(new Error('PDF file handling not yet implemented'));
            }
        });
    }

    async downloadZip(zipBlob, filename) {
        // Create download link
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        URL.revokeObjectURL(url);
    }

    generateZipName(fileType, startDate, endDate) {
        const start = new Date(startDate).toISOString().split('T')[0];
        const end = new Date(endDate).toISOString().split('T')[0];
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        
        return `facturas_${fileType}_${start}_${end}_${timestamp}.zip`;
    }

    clearFiles() {
        this.xmlFiles = [];
        this.pdfFiles = [];
        this.xmlZip = null;
        this.pdfZip = null;
    }

    getFileCounts() {
        return {
            xml: this.xmlFiles.length,
            pdf: this.pdfFiles.length
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileHandler;
} else {
    window.FileHandler = FileHandler;
}
