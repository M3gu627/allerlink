// Documents a food business uploads when applying to partner with AllerLink (Philippine requirements).
// Edit this list to add, remove or rename a document; the sign-up form and the employee review both read it.
const DOCUMENT_BUCKET = "business-documents";
const MAX_DOC_SIZE = 2 * 1024 * 1024; // 2 MB per file

const BUSINESS_DOCUMENTS = [
  { key: "registration", required: true, label: "DTI, SEC or CDA registration",
    hint: "DTI Business Name Certificate (sole proprietor), SEC Certificate (corporation or partnership) or CDA Certificate (cooperative)" },
  { key: "mayors_permit", required: true, label: "Mayor's / Business Permit",
    hint: "Current year, issued by your city or municipality" },
  { key: "bir_cor", required: true, label: "BIR Certificate of Registration (Form 2303)",
    hint: "Proof that the business is a registered taxpayer" },
  { key: "sanitary_permit", required: true, label: "Sanitary / Health Permit",
    hint: "Issued by your local health office" },
  { key: "fsic", required: true, label: "Fire Safety Inspection Certificate (FSIC)",
    hint: "Issued by the Bureau of Fire Protection" },
  { key: "barangay", required: false, label: "Barangay Business Clearance" },
  { key: "owner_id", required: false, label: "Valid government ID of the owner or representative" },
  { key: "other", required: false, label: "Other supporting document",
    hint: "For example DOT accreditation for hotels, or an FDA License to Operate for bakeries that manufacture food" },
];

// Draws one file picker per document into `root`, and checks type and size when a file is chosen.
function renderDocumentFields(root) {
  root.innerHTML = BUSINESS_DOCUMENTS.map(
    (doc) => `<label class="doc-field">
      <span>${doc.label} <small>${doc.required ? "(required)" : "(optional)"}</small></span>
      ${doc.hint ? `<small class="note">${doc.hint}</small>` : ""}
      <input type="file" data-doc="${doc.key}" accept="application/pdf,image/*" ${doc.required ? "required" : ""}>
    </label>`
  ).join("");

  root.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
      alert("Please upload a PDF or an image (JPG, PNG, ...).");
      e.target.value = "";
    } else if (file.size > MAX_DOC_SIZE) {
      alert(`${file.name} is larger than 2 MB. Please upload a smaller file.`);
      e.target.value = "";
    }
  });
}

// The files the applicant picked, as [{ key, file }].
function chosenDocuments(root) {
  return [...root.querySelectorAll("input[data-doc]")]
    .filter((input) => input.files[0])
    .map((input) => ({ key: input.dataset.doc, file: input.files[0] }));
}
