(function () {
  "use strict";

  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  var toggle = document.getElementById("nav-toggle");
  var nav = document.getElementById("main-nav");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  var resumeInput = document.getElementById("app-resume");
  var resumeName = document.getElementById("app-resume-name");

  if (resumeInput && resumeName) {
    resumeInput.addEventListener("change", function () {
      resumeName.textContent = resumeInput.files.length
        ? resumeInput.files[0].name
        : "No file selected (optional)";
    });
  }

  // Stamps how long the form was on screen before submitting, for the
  // server-side bot check. Measured entirely in the browser as a single
  // subtraction, so a wrong client clock can't skew it. Bound on document in
  // the capture phase so it always runs before a form's own submit handler
  // builds its FormData.
  var pageLoadedAt = Date.now();

  document.addEventListener(
    "submit",
    function (event) {
      var elapsedField = event.target.querySelector("input[name=elapsed]");
      if (elapsedField) elapsedField.value = String(Date.now() - pageLoadedAt);
    },
    true
  );

  var applicationForm = document.getElementById("application-form");
  var applicationSuccess = document.getElementById("application-success");
  var applicationError = document.getElementById("application-error");

  if (applicationForm && applicationSuccess) {
    applicationForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!applicationForm.reportValidity()) return;

      var submitBtn = applicationForm.querySelector("button[type=submit]");
      var formData = new FormData(applicationForm);

      if (applicationError) applicationError.hidden = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting…";
      }

      fetch("/api/apply", {
        method: "POST",
        body: formData,
      })
        .then(function (response) {
          if (!response.ok) throw new Error("Submission failed");
          applicationForm.hidden = true;
          applicationSuccess.hidden = false;
          applicationSuccess.scrollIntoView({ behavior: "smooth", block: "start" });
        })
        .catch(function () {
          if (applicationError) applicationError.hidden = false;
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit Application";
          }
        });
    });
  }

  var tabButtons = document.querySelectorAll(".tab-btn");
  var tabPanels = document.querySelectorAll(".tab-panel");

  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      tabButtons.forEach(function (b) {
        b.classList.remove("is-active");
        b.setAttribute("aria-selected", "false");
        b.tabIndex = -1;
      });
      tabPanels.forEach(function (p) {
        p.hidden = true;
      });

      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      btn.tabIndex = 0;
      document.getElementById(btn.getAttribute("aria-controls")).hidden = false;
    });
  });

  function bindLeadForm(formId, successId, errorId, errorMessageId) {
    var form = document.getElementById(formId);
    var success = document.getElementById(successId);
    var error = document.getElementById(errorId);
    var errorMessage = errorMessageId ? document.getElementById(errorMessageId) : null;
    if (!form || !success) return;

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;

      var submitBtn = form.querySelector("button[type=submit]");
      var formData = new FormData(form);

      if (error) error.hidden = true;
      if (submitBtn) {
        submitBtn.dataset.originalText = submitBtn.dataset.originalText || submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting…";
      }

      fetch("/api/estimate", {
        method: "POST",
        body: formData,
      })
        .then(function (response) {
          return response.json().then(function (data) {
            if (!response.ok || !data.ok) {
              var err = new Error(data.error || "Submission failed");
              err.fields = data.fields;
              throw err;
            }
            return data;
          });
        })
        .then(function () {
          form.hidden = true;
          success.hidden = false;
          success.scrollIntoView({ behavior: "smooth", block: "start" });
        })
        .catch(function (err) {
          if (errorMessage) {
            errorMessage.textContent =
              err && err.fields && err.fields.indexOf("address") !== -1
                ? "We couldn't find that address. Please double check it and try again, or call us at"
                : "Something went wrong submitting your request. Please try again or call us at";
          }
          if (error) error.hidden = false;
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = submitBtn.dataset.originalText;
          }
        });
    });
  }

  function bindHaulingForm() {
    var form = document.getElementById("hauling-form");
    var success = document.getElementById("hauling-success");
    var error = document.getElementById("hauling-error");
    var errorMessage = document.getElementById("hauling-error-message");
    var instantResult = document.getElementById("hauling-instant-result");
    var instantAmount = document.getElementById("hauling-instant-amount");
    var reviewConfirm = document.getElementById("hauling-review-confirm");
    var reviewMessage = document.getElementById("hauling-review-message");
    var reviewConfirmBtn = document.getElementById("hauling-review-confirm-btn");
    var reviewCancelBtn = document.getElementById("hauling-review-cancel-btn");
    if (!form || !success) return;

    var submitBtn = form.querySelector("button[type=submit]");
    var currencyFormatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

    function setSubmitting(isSubmitting) {
      if (!submitBtn) return;
      submitBtn.dataset.originalText = submitBtn.dataset.originalText || submitBtn.textContent;
      submitBtn.disabled = isSubmitting;
      submitBtn.textContent = isSubmitting ? "Submitting…" : submitBtn.dataset.originalText;
    }

    function submitEstimate(confirmSubmission) {
      var formData = new FormData(form);
      if (confirmSubmission) formData.set("confirm", "1");
      return fetch("/api/estimate", { method: "POST", body: formData })
        .then(function (response) {
          return response.json();
        })
        .then(function (data) {
          if (!data.ok) {
            var err = new Error(data.error || "Submission failed");
            err.fields = data.fields;
            throw err;
          }
          return data;
        });
    }

    function showError(err) {
      if (!error) return;
      if (errorMessage) {
        errorMessage.textContent =
          err && err.fields && err.fields.indexOf("address") !== -1
            ? "We couldn't find that address. Please double check it and try again, or call us at"
            : "Something went wrong submitting your request. Please try again or call us at";
      }
      error.hidden = false;
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;

      if (error) error.hidden = true;
      if (reviewConfirm) reviewConfirm.hidden = true;
      setSubmitting(true);

      submitEstimate(false)
        .then(function (data) {
          setSubmitting(false);

          if (data.instant) {
            form.hidden = true;
            if (instantAmount) {
              instantAmount.textContent = currencyFormatter.format(data.estimate.total);
            }
            if (instantResult) {
              instantResult.hidden = false;
              instantResult.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          } else if (data.needsReview) {
            if (reviewMessage) {
              reviewMessage.textContent = data.outOfArea
                ? "Your address is outside our 15-mile service area, so we can't give you an instant price. Want to submit your request anyway? The owner will review it and follow up with a custom quote."
                : "Jobs over four loads need a closer look for accurate pricing. Want to submit your request for review? The owner will follow up with a custom quote.";
            }
            if (reviewConfirm) {
              reviewConfirm.hidden = false;
              reviewConfirm.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }
        })
        .catch(function (err) {
          setSubmitting(false);
          showError(err);
        });
    });

    if (reviewConfirmBtn) {
      reviewConfirmBtn.addEventListener("click", function () {
        reviewConfirmBtn.disabled = true;
        reviewConfirmBtn.textContent = "Submitting…";

        submitEstimate(true)
          .then(function () {
            if (reviewConfirm) reviewConfirm.hidden = true;
            form.hidden = true;
            success.hidden = false;
            success.scrollIntoView({ behavior: "smooth", block: "start" });
          })
          .catch(function (err) {
            reviewConfirmBtn.disabled = false;
            reviewConfirmBtn.textContent = "Submit For Review";
            showError(err);
          });
      });
    }

    if (reviewCancelBtn) {
      reviewCancelBtn.addEventListener("click", function () {
        if (reviewConfirm) reviewConfirm.hidden = true;
      });
    }
  }

  var excavServiceSelect = document.getElementById("excav-service");
  var excavServiceOtherField = document.getElementById("excav-service-other-field");
  var excavServiceOtherInput = document.getElementById("excav-service-other");

  if (excavServiceSelect && excavServiceOtherField && excavServiceOtherInput) {
    excavServiceSelect.addEventListener("change", function () {
      var isOther = excavServiceSelect.value === "other";
      excavServiceOtherField.hidden = !isOther;
      excavServiceOtherInput.required = isOther;
      if (!isOther) excavServiceOtherInput.value = "";
    });
  }

  bindHaulingForm();
  bindLeadForm("excavation-form", "excavation-success", "excavation-error", "excavation-error-message");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var contours = document.querySelector(".hero-contours");

  if (contours && !reduceMotion) {
    var ticking = false;
    window.addEventListener(
      "scroll",
      function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () {
          var offset = Math.min(window.scrollY * 0.08, 40);
          contours.style.transform = "translateY(" + offset + "px)";
          ticking = false;
        });
      },
      { passive: true }
    );
  }
})();
