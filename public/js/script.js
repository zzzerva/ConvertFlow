/**
 * Ön yüz: sürükle-bırak, dosya seçme, API çağrısı, bildirimler ve indirme bağlantısı.
 * Sunucu ile aynı maksimum boyut (10 MB) — sunucu tarafı asıl sınırı uygular.
 */
(function () {
  "use strict";

  var MAX_BYTES = 10 * 1024 * 1024;

  var dropzone = document.getElementById("dropzone");
  var fileInput = document.getElementById("file-input");
  var pickBtn = document.getElementById("pick-file");
  var fileNameEl = document.getElementById("file-name");
  var conversionSelect = document.getElementById("conversion-type");
  var convertBtn = document.getElementById("convert-btn");
  var downloadBtn = document.getElementById("download-btn");
  var btnSpinner = document.getElementById("btn-spinner");
  var toastStack = document.getElementById("toast-stack");

  var selectedFile = null;
  var lastDownloadName = null;

  function showToast(message, type) {
    if (!toastStack) return;
    var el = document.createElement("div");
    el.className = "toast " + (type === "success" ? "success" : "error");
    el.textContent = message;
    toastStack.appendChild(el);
    window.setTimeout(function () {
      el.remove();
    }, 4500);
  }

  function setLoading(isLoading) {
    if (!convertBtn || !btnSpinner) return;
    convertBtn.disabled = isLoading || !selectedFile || !conversionSelect.value;
    var label = convertBtn.querySelector(".btn-label");
    if (label) label.textContent = isLoading ? "Dönüştürülüyor…" : "Convert";
    btnSpinner.hidden = !isLoading;
  }

  function updateUi() {
    if (fileNameEl) {
      fileNameEl.textContent = selectedFile
        ? selectedFile.name
        : "Henüz dosya seçilmedi";
    }
    if (convertBtn) {
      convertBtn.disabled = !selectedFile || !conversionSelect.value;
    }
    if (downloadBtn) {
      downloadBtn.hidden = true;
      downloadBtn.removeAttribute("href");
    }
    lastDownloadName = null;
  }

  function validateSize(file) {
    if (file.size > MAX_BYTES) {
      showToast("Dosya 10 MB sınırını aşıyor.", "error");
      return false;
    }
    return true;
  }

  function setFile(file) {
    if (!file) return;
    if (!validateSize(file)) return;
    selectedFile = file;
    updateUi();
  }

  if (pickBtn && fileInput) {
    pickBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", function () {
      var f = fileInput.files && fileInput.files[0];
      if (f) setFile(f);
    });
  }

  if (dropzone && fileInput) {
    dropzone.addEventListener("click", function () {
      fileInput.click();
    });

    dropzone.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });

    ["dragenter", "dragover"].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("dragover");
      });
    });

    dropzone.addEventListener("drop", function (e) {
      var dt = e.dataTransfer;
      if (!dt || !dt.files || !dt.files[0]) return;
      setFile(dt.files[0]);
    });
  }

  if (conversionSelect) {
    conversionSelect.addEventListener("change", function () {
      if (convertBtn) {
        convertBtn.disabled = !selectedFile || !conversionSelect.value;
      }
    });
  }

  if (convertBtn) {
    convertBtn.addEventListener("click", function () {
      if (!selectedFile || !conversionSelect.value) {
        showToast("Dosya ve dönüşüm türünü seçin.", "error");
        return;
      }

      var fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("conversionType", conversionSelect.value);

      setLoading(true);

      fetch("/api/convert", {
        method: "POST",
        body: fd,
      })
        .then(function (res) {
          return res.text().then(function (text) {
            var data;
            try {
              data = JSON.parse(text);
            } catch {
              data = { message: text || "Sunucudan geçersiz yanıt alındı." };
            }
            return { ok: res.ok, status: res.status, data: data };
          });
        })
        .then(function (result) {
          if (result.ok && result.data && result.data.ok) {
            lastDownloadName = result.data.fileName;
            var msg = result.data.message || "Dönüşüm tamamlandı.";
            showToast(msg, "success");
            if (downloadBtn && lastDownloadName) {
              downloadBtn.hidden = false;
              downloadBtn.href =
                "/api/download/" + encodeURIComponent(lastDownloadName);
              downloadBtn.setAttribute("download", "");
            }
          } else {
            var errText =
              (result.data && result.data.message) ||
              "İşlem başarısız oldu (" + result.status + ").";
            showToast(errText, "error");
          }
        })
        .catch(function () {
          showToast("Ağ hatası veya sunucuya ulaşılamıyor.", "error");
        })
        .finally(function () {
          setLoading(false);
        });
    });
  }

  updateUi();
})();
