class DownloadManager {
    constructor() {
        this.isDownloading = false;
        this.downloadQueue = [];
        this.currentTabId = null;
        this.downloadedInvoices = [];
        this.fileHandler = new FileHandler();
        this.completedFiles = [];
        this.xmlFiles = [];
        this.pdfFiles = [];
        this.currentProgress = 0;
        this.totalFiles = 0;
        this.cancelled = false;

        this.monthsToProcess = [];
        this.allInvoices = [];

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Form submission
        document.getElementById('downloadForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.startDownload();
        });

        // Go to Portal button
        document.getElementById('goToPortal').addEventListener('click', () => {
            this.goToPortal();
        });

        // Cancel button
        document.getElementById('cancelDownload').addEventListener('click', () => {
            this.cancelDownload();
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
        this.allInvoices = [];
        this.currentProgress = 0;
        this.totalFiles = 0;

        this.showProgressInterface();

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const targetUrl = invoiceType === 'emitidas'
                ? 'https://portalcfdi.facturaelectronica.sat.gob.mx/ConsultaEmisor.aspx'
                : 'https://portalcfdi.facturaelectronica.sat.gob.mx/ConsultaReceptor.aspx';

            this.updateProgress('Navegando al portal del SAT...', 5);
            await chrome.tabs.update(tab.id, { url: targetUrl });

            await this.waitForPageLoad(tab.id);

            await this.automateDownload(tab.id, invoiceType, startDate, endDate);

        } catch (error) {
            console.error('Download error:', error);
            this.showAlert(`Error durante la descarga: ${error.message}`, 'danger');
            this.hideProgressInterface();
        } finally {
            this.isDownloading = false;
        }
    }

    async goToPortal() {
        const invoiceType = document.getElementById('invoiceType').value;
        
        if (!invoiceType) {
            this.showAlert('Por favor seleccione el tipo de facturas', 'warning');
            return;
        }

        const targetUrl = invoiceType === 'emitidas'
            ? 'https://portalcfdi.facturaelectronica.sat.gob.mx/ConsultaEmisor.aspx'
            : 'https://portalcfdi.facturaelectronica.sat.gob.mx/ConsultaReceptor.aspx';

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.update(tab.id, { url: targetUrl });
            this.showAlert('Navegando al portal del SAT. Una vez ahí, haga clic en "Iniciar Proceso"', 'info');
        } catch (error) {
            console.error('Navigation error:', error);
            this.showAlert(`Error al navegar: ${error.message}`, 'danger');
        }
    }

    getMonthsBetween(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const months = [];
        let current = new Date(start.getFullYear(), start.getMonth(), 1);

        while (current <= end) {
            months.push({
                year: current.getFullYear(),
                month: current.getMonth() + 1 // 1-indexed
            });
            current.setMonth(current.getMonth() + 1);
        }
        return months;
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
            // Check if session is expired (redirected to login)
            const loginUrl = 'https://cfdiau.sat.gob.mx/nidp/wsfed_portalCFDI.jsp';
            
            const tab = await chrome.tabs.get(tabId);
            if (tab.url && tab.url.includes('cfdiau.sat.gob.mx')) {
                // Session expired, redirect to login
                const redirectUrl = `https://cfdiau.sat.gob.mx/nidp/wsfed_portalCFDI.jsp?wa=wsignin1.0&wtrealm=https%3a%2f%2fportalcfdi.facturaelectronica.sat.gob.mx&wctx=rm%3d0%26id%3dpassive%26ru%3d%252f${invoiceType === 'emitidas' ? 'ConsultaEmisor' : 'ConsultaReceptor'}.aspx&wct=${new Date().toISOString()}&wreply=https%3a%2f%2fportalcfdi.facturaelectronica.sat.gob.mx`;
                await chrome.tabs.update(tabId, { url: redirectUrl });
                this.showAlert('Sesión expirada. Redirigiendo al login del SAT...', 'warning');
                this.hideProgressInterface();
                return;
            }

            this.showPageStatus(tabId);
            this.updateProgress('Preparando búsqueda...', 10);
            await this.updatePageStatus(tabId, 'Preparando búsqueda...', 10);
            await this.delay(2000);

            if (invoiceType === 'recibidas') {
                const months = this.getMonthsBetween(startDate, endDate);
                for (let i = 0; i < months.length; i++) {
                    if (this.cancelled) throw new Error('Descarga cancelada');
                    
                    const { year, month } = months[i];
                    const progress = 10 + (i * 20 / months.length);
                    const statusText = `Buscando facturas de ${month}/${year}...`;
                    
                    this.updateProgress(statusText, progress);
                    await this.updatePageStatus(tabId, statusText, progress);
                    
                    await this.fillRecibidasForm(tabId, year, month);
                    await this.delay(3000); // Wait for results
                    
                    const invoices = await this.getInvoiceList(tabId);
                    this.allInvoices.push(...invoices);
                }
            } else {
                this.updateProgress('Buscando facturas emitidas...', 15);
                await this.updatePageStatus(tabId, 'Buscando facturas emitidas...', 15);
                
                await this.fillEmitidasForm(tabId, startDate, endDate);
                await this.delay(3000); // Wait for results
                
                const invoices = await this.getInvoiceList(tabId);
                this.allInvoices.push(...invoices);
            }

            if (this.allInvoices.length === 0) {
                await this.updatePageStatus(tabId, 'No se encontraron facturas', 100);
                setTimeout(() => this.removePageStatus(tabId), 3000);
                this.showAlert('No se encontraron facturas en el rango especificado', 'info');
                this.hideProgressInterface();
                return;
            }

            // Remove duplicates (based on UUID)
            const uniqueInvoices = Array.from(new Map(this.allInvoices.map(item => [item.uuid, item])).values());
            
            this.totalFiles = uniqueInvoices.length * 2;
            this.updateProgress(`Encontradas ${uniqueInvoices.length} facturas. Iniciando descarga...`, 30);
            await this.updatePageStatus(tabId, `Iniciando descarga de ${uniqueInvoices.length} facturas...`, 30);

            for (let i = 0; i < uniqueInvoices.length; i++) {
                if (this.cancelled) throw new Error('Descarga cancelada');

                const invoice = uniqueInvoices[i];
                const progress = 30 + (i * 60 / uniqueInvoices.length);
                const statusText = `Descargando ${i + 1}/${uniqueInvoices.length}: ${invoice.uuid}`;
                
                this.updateProgress(statusText, progress);
                await this.updatePageStatus(tabId, statusText, progress);


                console.log('Downloading invoice:', invoice);

                await this.downloadInvoiceFile(tabId, invoice, 'xml');
                await this.downloadInvoiceFile(tabId, invoice, 'pdf');
                this.completedFiles.push(invoice.uuid);
            }

            this.updateProgress('Descarga completada', 100);
            await this.updatePageStatus(tabId, '¡Descarga completada!', 100);
            
            setTimeout(() => this.removePageStatus(tabId), 5000);
            this.showDownloadResults();

        } catch (error) {
            await this.updatePageStatus(tabId, `Error: ${error.message}`, 0);
            throw error;
        }
    }

    async fillEmitidasForm(tabId, startDate, endDate) {
        const [sy, sm, sd] = startDate.split('-');
        const [ey, em, ed] = endDate.split('-');

        await chrome.scripting.executeScript({
            target: { tabId },
            func: (sd, sm, sy, ed, em, ey) => {
                return new Promise((resolve) => {
                    const fechaRadio = document.querySelector('input[value="RdoFechas"]');
                    if (fechaRadio && !fechaRadio.checked) fechaRadio.click();

                    setTimeout(() => {
                        const initialInput = document.querySelector('#ctl00_MainContent_CldFechaInicial2_Calendario_text');
                        const finalInput = document.querySelector('#ctl00_MainContent_CldFechaFinal2_Calendario_text');

                        if (initialInput) {
                            initialInput.value = `${sd}/${sm}/${sy}`;
                            initialInput.dispatchEvent(new Event('change'));
                        }
                        if (finalInput) {
                            finalInput.value = `${ed}/${em}/${ey}`;
                            finalInput.dispatchEvent(new Event('change'));
                        }

                        const searchBtn = document.querySelector('#ctl00_MainContent_BtnBusqueda');
                        if (searchBtn) {
                            searchBtn.click();
                        }
                        resolve();
                    }, 1000);
                });
            },
            args: [sd, sm, sy, ed, em, ey]
        });
    }

    async fillRecibidasForm(tabId, year, month) {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: (year, month) => {
                return new Promise((resolve) => {
                    const wait = (ms) => new Promise(r => setTimeout(r, ms));
                    
                    const executeSearch = async () => {
                        // Intentar encontrar el radio button por ID o por valor
                        const rdoFechas = document.getElementById('ctl00_MainContent_RdoFechas') || 
                                         document.querySelector('input[value="RdoFechas"]');
                        
                        if (rdoFechas && !rdoFechas.checked) {
                            console.log("Activando radio button de fechas...");
                            rdoFechas.click();
                            rdoFechas.dispatchEvent(new Event('change', { bubbles: true }));
                            await wait(2000); // Esperar a que el portal procese el cambio
                        }

                        // Verificar si los selectores están presentes
                        let ddlAnio = document.getElementById('DdlAnio');
                        let ddlMes = document.getElementById('ctl00_MainContent_CldFecha_DdlMes');

                        if (!ddlAnio || !ddlMes) {
                            console.error("No se encontraron los selectores de fecha. Reintentando activación...");
                            // Reintentar clic en el radio button por si acaso
                            if (rdoFechas) rdoFechas.click();
                            await wait(2000);
                            ddlAnio = document.getElementById('DdlAnio');
                            ddlMes = document.getElementById('ctl00_MainContent_CldFecha_DdlMes');
                        }

                        if (ddlAnio) {
                            console.log(`Seleccionando año ${year}`);
                            ddlAnio.value = year.toString();
                            ddlAnio.dispatchEvent(new Event('change', { bubbles: true }));
                            await wait(1000);
                        }

                        if (ddlMes) {
                            console.log(`Seleccionando mes ${month}`);
                            ddlMes.value = month.toString();
                            ddlMes.dispatchEvent(new Event('change', { bubbles: true }));
                            await wait(1000);
                        }

                        const ddlDia = document.getElementById('ctl00_MainContent_CldFecha_DdlDia');
                        if (ddlDia) {
                            ddlDia.value = "0";
                            ddlDia.dispatchEvent(new Event('change', { bubbles: true }));
                            await wait(500);
                        }

                        const searchBtn = document.querySelector('#ctl00_MainContent_BtnBusqueda');
                        if (searchBtn) {
                            console.log("Iniciando búsqueda...");
                            searchBtn.click();
                            resolve(true);
                        } else {
                            console.error("No se encontró el botón de búsqueda");
                            resolve(false);
                        }
                    };

                    executeSearch();
                });
            },
            args: [year, month]
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

                        console.log('PDF button found:', pdfButton ? 'yes' : 'no');
                        if (pdfButton) {
                            console.log('PDF onclick:', pdfButton.getAttribute('onclick'));
                        }

                        if (uuidCell && xmlButton) {
                            const uuid = uuidCell.textContent.trim();
                            const xmlOnclick = xmlButton.getAttribute('onclick');
                            const pdfOnclick = pdfButton ? pdfButton.getAttribute('onclick') : null;

                            // Extract URL from onclick - XML
                            const xmlMatch = xmlOnclick.match(/RecuperaCfdi\.aspx\?Datos=([^']+)/);
                            
                            // For PDF, extract only the token
                            let pdfUrl = null;
                            if (pdfOnclick) {
                                const pdfMatch = pdfOnclick.match(/recuperaRepresentacionImpresa\('([^']+)'\)/);
                                console.log('PDF match:', pdfMatch);
                                pdfUrl = pdfMatch ? pdfMatch[1] : null;
                            }

                            invoices.push({
                                uuid,
                                xmlUrl: xmlMatch ? xmlMatch[1] : null,
                                pdfUrl: pdfUrl
                            });

                             
                        }
                    });
                }
                console.log('Invoices found:', invoices);
                return invoices;
            }
        });

        return result[0].result;
    }

    async downloadInvoiceFile(tabId, invoice, type) {
        try {
         
            const url = type === 'xml' ? invoice.xmlUrl : invoice.pdfUrl;
            console.log(`downloadInvoiceFile: type=${type}, url=${url}, pdfUrl=${invoice.pdfUrl}`);
            if (!url) {
                console.warn(`No hay URL de ${type} para ${invoice.uuid}`);
                return;
            }

            const fileName = `${invoice.uuid}.${type}`;
            
            if (type === 'xml') {
                // Fetch XML content first to ensure we have it
                const [response] = await chrome.scripting.executeScript({
                    target: { tabId },
                    func: async (downloadUrl) => {
                        try {
                            const resp = await fetch(`RecuperaCfdi.aspx?Datos=${downloadUrl}`);
                            const text = await resp.text();
                            return { success: true, content: text };
                        } catch (e) {
                            return { success: false, error: e.message };
                        }
                    },
                    args: [url]
                });

                if (response.result.success) {
                    const dataUrl = 'data:text/xml;charset=utf-8,' + encodeURIComponent(response.result.content);
                    await chrome.downloads.download({
                        url: dataUrl,
                        filename: fileName,
                        saveAs: false
                    });
                }
            } else {
                // For PDF, use POST method with token in body
                console.log('PDF download: Starting executeScript for', invoice.pdfUrl);
                
                const [response] = await chrome.scripting.executeScript({
                    target: { tabId },
                    func: async (pdfUrl) => {
                        try {
                            const baseUrl = 'RecuperaRepresentacionImpresa';
                            const url = `${baseUrl}?Datos=${pdfUrl}`;
                            console.log(`PDF download: pdfUrl=${url}`);
                            const activeToken = await fetch(url, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    datos: pdfUrl
                                })
                            });
                            const pdfResp = await fetch("RepresentacionImpresa.aspx?Datos=" + pdfUrl);
                            const blob = await pdfResp.blob();
                            console.log(`PDF blob size: ${blob.size}, type: ${blob.type}`);
                            // Convert blob to data URL in content script (blob can't be serialized across contexts)
                            const reader = new FileReader();
                            const dataUrl = await new Promise((resolve, reject) => {
                                reader.onload = () => resolve(reader.result);
                                reader.onerror = reject;
                                reader.readAsDataURL(blob);
                            });
                            return { success: true, dataUrl: dataUrl };
                        } catch (e) {
                            console.error(`PDF fetch error: ${e.message}`);
                            return { success: false, error: e.message };
                        }
                    },
                    args: [invoice.pdfUrl]
                });

                console.log(`PDF response:`, response);
                console.log(`PDF response result:`, response?.result);

                if (response.result && response.result.success) {
                    const dataUrl = response.result.dataUrl;
                    await chrome.downloads.download({
                        url: dataUrl,
                        filename: fileName,
                        conflictAction: 'overwrite',
                        saveAs: false
                    });
                }
            }

        } catch (error) {
            console.error(`Error downloading ${type} for ${invoice.uuid}:`, error);
        }
    }



    async showPageStatus(tabId) {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                if (document.getElementById('sat-bot-status')) return;

                const container = document.createElement('div');
                container.id = 'sat-bot-status';
                container.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    width: 300px;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    z-index: 999999;
                    padding: 15px;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    border: 1px solid #e0e0e0;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                `;

                const header = document.createElement('div');
                header.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-weight: bold;
                    color: #002e5f;
                `;
                header.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    SAT Bot - Descargando
                `;

                const statusText = document.createElement('div');
                statusText.id = 'sat-bot-status-text';
                statusText.style.cssText = 'font-size: 13px; color: #666;';
                statusText.innerText = 'Iniciando...';

                const progressContainer = document.createElement('div');
                progressContainer.style.cssText = `
                    width: 100%;
                    height: 8px;
                    background: #f0f0f0;
                    border-radius: 4px;
                    overflow: hidden;
                `;

                const progressBar = document.createElement('div');
                progressBar.id = 'sat-bot-progress-bar';
                progressBar.style.cssText = `
                    width: 0%;
                    height: 100%;
                    background: #007bff;
                    transition: width 0.3s ease;
                `;

                progressContainer.appendChild(progressBar);
                container.appendChild(header);
                container.appendChild(statusText);
                container.appendChild(progressContainer);
                document.body.appendChild(container);
            }
        });
    }

    async updatePageStatus(tabId, text, progress) {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: (text, progress) => {
                const statusText = document.getElementById('sat-bot-status-text');
                const progressBar = document.getElementById('sat-bot-progress-bar');
                if (statusText) statusText.innerText = text;
                if (progressBar) progressBar.style.width = `${progress}%`;
            },
            args: [text, progress]
        });
    }

    async removePageStatus(tabId) {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const container = document.getElementById('sat-bot-status');
                if (container) container.remove();
            }
        });
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
        this.showAlert(`Descarga completada: ${this.completedFiles.length} facturas procesadas`, 'success');
        this.hideProgressInterface();
    }

    cancelDownload() {
        this.cancelled = true;
        this.isDownloading = false;
        this.hideProgressInterface();
        this.showAlert('Descarga cancelada', 'info');
    }
 

    showAlert(message, type) {
        const alertContainer = document.getElementById('alert-container');
        const alert = document.createElement('div');
        // Vanilla CSS classes for alert instead of Bootstrap specifics
        alert.className = `alert alert-${type} d-flex justify-content-between alert-dismissible`;

        const messageSpan = document.createElement('span');
        messageSpan.innerHTML = message;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = () => {
            if (alert.parentNode) {
                alert.remove();
            }
        };

        alert.appendChild(messageSpan);
        alert.appendChild(closeBtn);
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
