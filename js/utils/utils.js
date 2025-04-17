export function searchTextInDOM(text) {
  const elements = document.querySelectorAll("*");

  for (let i = 0; i < elements.length; i++) {
    if (elements[i].textContent.trim() == text) {
      return true;
    }
  }

  return false;
}

export function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const intervalTime = 100; // Check every 100ms
    let elapsedTime = 0;

    const interval = setInterval(() => {
      const element = document.querySelector(selector);
      if (element) {
        clearInterval(interval);
        resolve(element);
      }

      elapsedTime += intervalTime;
      if (elapsedTime >= timeout) {
        clearInterval(interval);
        reject(
          new Error(
            `Element with selector "${selector}" not found within ${timeout}ms`
          )
        );
      }
    }, intervalTime);
  });
}

export async function setUpFile(filename, input) {
  try {
    readFile(filename)
      .then((data) => {
        const inputHTML = document.getElementById(input);
        const file = base64ToFile(data.content, filename, data.type);
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        inputHTML.files = dataTransfer.files;
        inputHTML.dispatchEvent(new Event("change"));
      })
      .catch((e) => {
        console.log("Error setup file", e);
        //alert("No se encontró el archivo del certificado");
      });
    return Promise.resolve();
  } catch (e) {
    reject(e);
  }
}

export function base64ToFile(base64, filename, mimeType) {
  const byteCharacters = atob(base64.split(",")[1]); // Decode Base64
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new File([byteArray], filename, { type: mimeType });
}

export async function setUpValueFromStorage(input, key) {
  chrome.storage.local.get([key], function (result) {
    if (result[key]) {
      setUpValue(input, result[key]);
      return Promise.resolve();
    }
  });
}

export function setUpValue(input, value) {
  const inputText = document.getElementById(input);
  inputText.value = value;
}
