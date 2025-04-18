export function findElementByText(text) {
    const elements = document.querySelectorAll("*"); // Select all elements
    return Array.from(elements).find((el) => el.textContent.trim() === text);
}

export async function InputTypeTextByAttribute(input, value) {
    const inputText = document.querySelector(`[${input}]`);
    if (!inputText) return false;

    inputText.focus();
    inputText.click();

    await new Promise(resolve => {
        const handler = () => {
            inputText.removeEventListener('focus', handler);
            resolve();
        };
        inputText.addEventListener('focus', handler);
    });

    inputText.value = value;
    inputText.dispatchEvent(new Event("input", { bubbles: true }));

    simulateKeydown(inputText, "ArrowDown");
    await new Promise(resolve => {
        const handler = () => {
            inputText.removeEventListener('keydown', handler);
            resolve();
        };
        inputText.addEventListener('keydown', handler);
    });

    simulateKeydown(inputText, "Enter");
    await new Promise(resolve => {
        const handler = () => {
            inputText.removeEventListener('keydown', handler);
            resolve();
        };
        inputText.addEventListener('keydown', handler);
    });

    inputText.dispatchEvent(new Event("change"));
    await new Promise(resolve => {
        const handler = () => {
            inputText.removeEventListener('change', handler);
            resolve();
        };
        inputText.addEventListener('change', handler);
    });

    return true;
}

export async function InputTypeTextById(input, value) {
    const inputText = document.getElementById(input);
    if (!inputText) return false;

    inputText.value = "";
    inputText.focus();
    inputText.click();

    await new Promise(resolve => {
        const handler = () => {
            inputText.removeEventListener('focus', handler);
            resolve();
        };
        inputText.addEventListener('focus', handler);
    });

    inputText.value = value;

    simulateKeydown(inputText, "ArrowDown");
    await new Promise(resolve => {
        const handler = () => {
            inputText.removeEventListener('keydown', handler);
            resolve();
        };
        inputText.addEventListener('keydown', handler);
    });

    simulateKeydown(inputText, "Enter");
    await new Promise(resolve => {
        const handler = () => {
            inputText.removeEventListener('keydown', handler);
            resolve();
        };
        inputText.addEventListener('keydown', handler);
    });

    inputText.dispatchEvent(new Event("change"));
    await new Promise(resolve => {
        const handler = () => {
            inputText.removeEventListener('change', handler);
            resolve();
        };
        inputText.addEventListener('change', handler);
    });

    return true;
}

//ui-menu ui-widget ui-widget-content ui-autocomplete ui-front
export async function InputTypeAutocomplete(input, value) {
    const inputText = document.getElementById(input);
    if (!inputText) return false;

    inputText.value = "";
    inputText.focus();
    inputText.click();

    await new Promise(resolve => {
        const handler = () => {
            inputText.removeEventListener('focus', handler);
            resolve();
        };
        inputText.addEventListener('focus', handler);
    });

    inputText.value = value;

    simulateKeydown(inputText, "ArrowDown");
    await new Promise(resolve => {
        const handler = () => {
            inputText.removeEventListener('keydown', handler);
            resolve();
        };
        inputText.addEventListener('keydown', handler);
    });

    simulateKeydown(inputText, "Enter");
    await new Promise(resolve => {
        const handler = () => {
            inputText.removeEventListener('keydown', handler);
            resolve();
        };
        inputText.addEventListener('keydown', handler);
    });

    // Esperar al menú de autocompletar
    await waitForAutocompleteMenu();

    simulateKeydown(inputText, "ArrowDown");
    await new Promise(resolve => {
        const handler = () => {
            inputText.removeEventListener('keydown', handler);
            resolve();
        };
        inputText.addEventListener('keydown', handler);
    });

    simulateKeydown(inputText, "Enter");
    await new Promise(resolve => {
        const handler = () => {
            inputText.removeEventListener('keydown', handler);
            resolve();
        };
        inputText.addEventListener('keydown', handler);
    });

    inputText.dispatchEvent(new Event("change"));
    await new Promise(resolve => {
        const handler = () => {
            inputText.removeEventListener('change', handler);
            resolve();
        };
        inputText.addEventListener('change', handler);
    });

    return true;
}

function simulateKeydown(inputText, key) {
    const event = new KeyboardEvent("keydown", {
        key: key, // La tecla a simular, por ejemplo 'Enter' o 'ArrowDown'
        code: key, // Código de la tecla
        keyCode: key === "Enter" ? 13 : 40, // Código numérico de la tecla
        bubbles: true, // Permitir que el evento burbujee
    });

    inputText.dispatchEvent(event);
}

export function simulateSelectOptionById(option, selectInput) {
    const selectElement = document.getElementById(selectInput);
    if (!selectElement) {
        console.log("No se encontró el select", selectInput);
        return;
    }
    selectElement.value = option;
    selectElement.dispatchEvent(new Event("change"));
}

export function simulateClick(className, entityID) {
    const elements = document.getElementsByClassName(className);
    const element = Array.from(elements).find(
        (el) => el.getAttribute("entidad") === entityID
    );
    if (element) {
        element.click();
    }
}

export function simulateClickLink(className, tabindex) {
    const elements = document.getElementsByClassName(className);
    if (elements.length > 0) {
        for (const element of elements) {
            if (element.getAttribute("tabindex") === tabindex) {
                element.click();
                break;
            }
        }
    }
}

export function waitForAutocompleteMenu() {
    return new Promise((resolve) => {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === "childList") {
                    const autocompleteMenus = document.querySelectorAll(
                        ".ui-menu.ui-widget.ui-widget-content.ui-autocomplete.ui-front"
                    );
                    if (
                        Array.from(autocompleteMenus).some(
                            (menu) => menu.style.display !== "none"
                        )
                    ) {
                        observer.disconnect();
                        resolve();
                        break;
                    }
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    });
}

