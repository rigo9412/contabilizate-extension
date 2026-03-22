class DownloadManager {
    constructor() {
        this.isDownloading = false;
        this.downloadQueue = [];
        this.currentTabId = null;
        this.downloadedInvoices = [];
        this.fileHandler = new FileHandler();
        this.init();
        this.completedFiles = [];
        this.xmlFiles = [];
        this.pdfFiles = [];
        this.currentProgress = 0;
        this.totalFiles = 0;
        this.cancelled = false;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Form submission
        document.getElementById('downloadForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.startDownload();
        });

        // Cancel button
        document.getElementById('cancelDownload').addEventListener('click', () => {
            this.cancelDownload();
        });

        // Download ZIP buttons
        document.getElementById('downloadXmlZip').addEventListener('click', () => {
            this.downloadZip('xml');
        });

        document.getElementById('downloadPdfZip').addEventListener('click', () => {
            this.downloadZip('pdf');
        });

        // Date validation
        document.getElementById('startDate').addEventListener('change', () => {
            this.validateDateRange();
        });

        document.getElementById('endDate').addEventListener('change', () => {
            this.validateDateRange();
        });
    }

    validateDateRange() {
        const startDate = new Date(document.getElementById('startDate').value);
        const endDate = new Date(document.getElementById('endDate').value);
        const startInput = document.getElementById('startDate');
        const endInput = document.getElementById('endDate');

        if (startDate && endDate) {
            if (startDate > endDate) {
                startInput.setCustomValidity('La fecha inicial debe ser anterior o igual a la fecha final');
                endInput.setCustomValidity('La fecha final debe ser posterior o igual a la fecha inicial');
            } else {
                startInput.setCustomValidity('');
                endInput.setCustomValidity('');
            }
        }
    }

    async startDownload() {
        if (this.isDownloading) {
            return;
        }

        const invoiceType = document.getElementById('invoiceType').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        if (!invoiceType || !startDate || !endDate) {
            this.showAlert('Por favor complete todos los campos', 'warning');
            return;
        }

        this.isDownloading = true;
        this.cancelled = false;
        this.xmlFiles = [];
        this.pdfFiles = [];
        this.completedFiles = [];
        this.currentProgress = 0;
        this.totalFiles = 0;

        this.showProgressInterface();

        try {
            // Get current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Navigate to appropriate SAT portal
            const targetUrl = invoiceType === 'emitidas' 
                ? 'https://portalcfdi.facturaelectronica.sat.gob.mx/ConsultaEmisor.aspx'
                : 'https://portalcfdi.facturaelectronica.sat.gob.mx/ConsultaReceptor.aspx';

            await chrome.tabs.update(tab.id, { url: targetUrl });

            // Wait for page to load
            await this.waitForPageLoad(tab.id);

            // Automate the download process
            await this.automateDownload(tab.id, invoiceType, startDate, endDate);

        } catch (error) {
            console.error('Download error:', error);
            this.showAlert(`Error durante la descarga: ${error.message}`, 'danger');
            this.hideProgressInterface();
        } finally {
            this.isDownloading = false;
        }
    }

    async waitForPageLoad(tabId) {
        return new Promise((resolve) => {
            const listener = (updatedTabId, changeInfo, tab) => {
                if (updatedTabId === tabId && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
        });
    }

    async automateDownload(tabId, invoiceType, startDate, endDate) {
        try {
            this.updateProgress('Navegando al portal del SAT...', 10);

            // Wait for the page to be ready
            await this.delay(2000);

            // Fill date forms and search
            await this.fillDateForm(tabId, startDate, endDate);
            
            this.updateProgress('Buscando facturas...', 20);

            // Wait for results
            await this.delay(3000);

            // Get invoice list
            const invoices = await this.getInvoiceList(tabId);
            
            if (invoices.length === 0) {
                this.showAlert('No se encontraron facturas en el rango de fechas especificado', 'info');
                this.hideProgressInterface();
                return;
            }

            this.totalFiles = invoices.length * 2; // XML + PDF for each invoice
            this.updateProgress(`Encontradas ${invoices.length} facturas. Iniciando descarga...`, 30);

            // Download files
            for (let i = 0; i < invoices.length; i++) {
                if (this.cancelled) {
                    throw new Error('Descarga cancelada por el usuario');
                }

                const invoice = invoices[i];
                this.updateProgress(`Descargando factura ${i + 1} de ${invoices.length}: ${invoice.uuid}`, 30 + (i * 60 / invoices.length));

                // Download XML
                await this.downloadInvoiceFile(tabId, invoice, 'xml');
                
                // Download PDF
                await this.downloadInvoiceFile(tabId, invoice, 'pdf');

                this.completedFiles.push(invoice.uuid);
            }

            // Create ZIP files
            this.updateProgress('Creando archivos ZIP...', 90);
            await this.createZipFiles();

            this.updateProgress('Descarga completada', 100);
            this.showDownloadResults();

        } catch (error) {
            throw error;
        }
    }

    async fillDateForm(tabId, startDate, endDate) {
        // Convert dates to the format expected by SAT portal
        const startParts = startDate.split('-');
        const endParts = endDate.split('-');
        
        const startDay = startParts[2];
        const startMonth = startParts[1];
        const startYear = startParts[0];
        
        const endDay = endParts[2];
        const endMonth = endParts[1];
        const endYear = endParts[0];

        // Fill the date form using the selectors from reference files
        const fillFormScript = `
            // Switch to date search if needed
            const fechaRadio = document.querySelector('input[value="RdoFechas"]');
            if (fechaRadio && !fechaRadio.checked) {
                fechaRadio.click();
                // Wait for form to update
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Fill initial date
            const initialDateInput = document.querySelector('#ctl00_MainContent_CldFechaInicial2_Calendario_text');
            if (initialDateInput) {
                initialDateInput.value = '${startDay}/${startMonth}/${startYear}';
                initialDateInput.dispatchEvent(new Event('change'));
            }

            // Fill final date
            const finalDateInput = document.querySelector('#ctl00_MainContent_CldFechaFinal2_Calendario_text');
            if (finalDateInput) {
                finalDateInput.value = '${endDay}/${endMonth}/${endYear}';
                finalDateInput.dispatchEvent(new Event('change'));
            }

            // Click search button
            const searchButton = document.querySelector('#ctl00_MainContent_BtnBusqueda');
            if (searchButton) {
                searchButton.click();
            }
        `;

        await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                return new Promise((resolve) => {
                    // Switch to date search if needed
                    const fechaRadio = document.querySelector('input[value="RdoFechas"]');
                    if (fechaRadio && !fechaRadio.checked) {
                        fechaRadio.click();
                        setTimeout(resolve, 1000);
                    } else {
                        resolve();
                    }
                });
            }
        });

        await chrome.scripting.executeScript({
            target: { tabId },
            func: (startDay, startMonth, startYear, endDay, endMonth, endYear) => {
                // Fill initial date
                const initialDateInput = document.querySelector('#ctl00_MainContent_CldFechaInicial2_Calendario_text');
                if (initialDateInput) {
                    initialDateInput.value = `${startDay}/${startMonth}/${startYear}`;
                    initialDateInput.dispatchEvent(new Event('change'));
                }

                // Fill final date
                const finalDateInput = document.querySelector('#ctl00_MainContent_CldFechaFinal2_Calendario_text');
                if (finalDateInput) {
                    finalDateInput.value = `${endDay}/${endMonth}/${endYear}`;
                    finalDateInput.dispatchEvent(new Event('change'));
                }

                // Click search button
                const searchButton = document.querySelector('#ctl00_MainContent_BtnBusqueda');
                if (searchButton) {
                    searchButton.click();
                }
            },
            args: [startDay, startMonth, startYear, endDay, endMonth, endYear]
        });
    }

    async getInvoiceList(tabId) {
        const result = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const invoices = [];
                const table = document.querySelector('#ctl00_MainContent_tblResult');
                
                if (table) {
                    const rows = table.querySelectorAll('tbody tr');
                    rows.forEach(row => {
                        const uuidCell = row.querySelector('td:nth-child(2) span');
                        const xmlButton = row.querySelector('[onclick*="RecuperaCfdi.aspx"]');
                        const pdfButton = row.querySelector('[onclick*="recuperaRepresentacionImpresa"]');
                        
                        if (uuidCell && xmlButton) {
                            const uuid = uuidCell.textContent.trim();
                            const xmlOnclick = xmlButton.getAttribute('onclick');
                            const pdfOnclick = pdfButton ? pdfButton.getAttribute('onclick') : null;
                            
                            // Extract URL from onclick
                            const xmlMatch = xmlOnclick.match(/RecuperaCfdi\.aspx\?Datos=([^']+)/);
                            const pdfMatch = pdfOnclick ? pdfOnclick.match(/recuperaRepresentacionImpresa\('([^']+)'\)/) : null;
                            
                            invoices.push({
                                uuid,
                                xmlUrl: xmlMatch ? xmlMatch[1] : null,
                                pdfUrl: pdfMatch ? pdfMatch[1] : null
                            });
                        }
                    });
                }
                
                return invoices;
            }
        });

        return result[0].result;
    }

    async downloadInvoiceFile(tabId, invoice, type) {
        try {
            const url = type === 'xml' ? invoice.xmlUrl : invoice.pdfUrl;
            if (!url) return;

            const result = await chrome.scripting.executeScript({
                target: { tabId },
                func: (downloadUrl, fileType, uuid) => {
                    return new Promise((resolve) => {
                        // Create a hidden link to trigger download
                        const link = document.createElement('a');
                        link.href = fileType === 'xml' 
                            ? `RecuperaCfdi.aspx?Datos=${downloadUrl}`
                            : `javascript:recuperaRepresentacionImpresa('${downloadUrl}')`;
                        
                        if (fileType === 'xml') {
                            link.download = `${uuid}.xml`;
                            link.click();
                        } else {
                            // For PDF, we need to call the function
                            setTimeout(() => {
                                window.recuperaRepresentacionImpresa(downloadUrl);
                                resolve();
                            }, 500);
                        }
                        
                        resolve();
                    });
                },
                args: [url, type, invoice.uuid]
            });

            // Add to appropriate file list
            if (type === 'xml') {
                this.xmlFiles.push({ uuid, url, type });
            } else {
                this.pdfFiles.push({ uuid, url, type });
            }

        } catch (error) {
            console.error(`Error downloading ${type} for ${invoice.uuid}:`, error);
        }
    }

    async createZipFiles() {
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        
        try {
            // Create XML ZIP
            if (this.xmlFiles.length > 0) {
                for (const file of this.xmlFiles) {
                    this.fileHandler.addXmlFile({
                        url: file.url,
                        filename: `${file.uuid}.xml`
                    });
                }
                
                const xmlZipBlob = await this.fileHandler.createXmlZip();
                const xmlZipName = this.fileHandler.generateZipName('xml', startDate, endDate);
                await this.fileHandler.downloadZip(xmlZipBlob, xmlZipName);
            }

            // Create PDF ZIP
            if (this.pdfFiles.length > 0) {
                for (const file of this.pdfFiles) {
                    this.fileHandler.addPdfFile({
                        url: file.url,
                        filename: `${file.uuid}.pdf`
                    });
                }
                
                const pdfZipBlob = await this.fileHandler.createPdfZip();
                const pdfZipName = this.fileHandler.generateZipName('pdf', startDate, endDate);
                await this.fileHandler.downloadZip(pdfZipBlob, pdfZipName);
            }
            
        } catch (error) {
            console.error('Error creating ZIP files:', error);
            throw new Error(`Error al crear archivos ZIP: ${error.message}`);
        }
    }

    updateProgress(status, percent) {
        document.getElementById('progressStatus').textContent = status;
        document.getElementById('progressPercent').textContent = `${percent}%`;
        document.getElementById('progressBar').style.width = `${percent}%`;
        document.getElementById('currentFile').textContent = status;
        document.getElementById('filesCount').textContent = `${this.completedFiles.length} archivos procesados`;
    }

    showProgressInterface() {
        document.getElementById('progressCard').style.display = 'block';
        document.getElementById('startDownload').style.display = 'none';
        document.getElementById('cancelDownload').style.display = 'inline-block';
        document.getElementById('downloadResults').style.display = 'none';
    }

    hideProgressInterface() {
        document.getElementById('progressCard').style.display = 'none';
        document.getElementById('startDownload').style.display = 'inline-block';
        document.getElementById('cancelDownload').style.display = 'none';
    }

    showDownloadResults() {
        document.getElementById('downloadResults').style.display = 'block';
        this.showAlert(`Descarga completada: ${this.xmlFiles.length} archivos XML y ${this.pdfFiles.length} archivos PDF`, 'success');
    }

    cancelDownload() {
        this.cancelled = true;
        this.isDownloading = false;
        this.hideProgressInterface();
        this.showAlert('Descarga cancelada', 'info');
    }

    downloadZip(type) {
        // This will be implemented with actual ZIP download functionality
        this.showAlert(`Función de descarga ZIP para ${type} próximamente disponible`, 'info');
    }

    showAlert(message, type) {
        const alertContainer = document.getElementById('alert-container');
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        alertContainer.appendChild(alert);

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            if (alert.parentNode) {
                alert.remove();
            }
        }, 5000);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the download manager when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.downloadManager = new DownloadManager();
});
