import { useState } from "react";
import client from "../../api/client";
import {
  IconArrowLeft,
  IconMail,
  IconCheck,
} from "../../components/Icons";

export default function EmailView({ onBack, onSubmitted }) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  const submit = async () => {
    if (!subject.trim() || !description.trim()) return;

    setSubmitting(true);

    try {
      const res = await client.post("/tickets/", {
        title: subject,
        description,
        channel: "web",
      });

      setDone(res.data);
      onSubmitted?.();
    } catch {
      alert("Failed to submit ticket");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="w-full">

        <div className="bg-white border border-slate-200 rounded-3xl p-10 shadow-sm text-center">

          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
            <IconCheck
              width={32}
              height={32}
              className="text-emerald-600"
            />
          </div>

          <h2 className="text-2xl font-bold text-slate-900">
            Ticket Submitted
          </h2>

          <p className="text-slate-500 mt-3">
            Your request has been sent successfully.
          </p>

          <div className="inline-flex mt-5 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-medium">
            Ticket #{done.id.slice(0, 8)}
          </div>

          <button
            onClick={onBack}
            className="mt-8 bg-indigo-600 text-white px-6 py-3 rounded-xl hover:bg-indigo-700 transition"
          >
            Back to Dashboard
          </button>

        </div>

      </div>
    );
  }

  return (
    <div className="w-full">

      <button
        onClick={onBack}
        className="mb-5 flex items-center gap-2 text-slate-500 hover:text-slate-800 transition"
      >
        <IconArrowLeft width={16} height={16} />
        Back
      </button>

      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">

        {/* Header */}

        <div className="border-b border-slate-200 p-8">

          <div className="flex items-center gap-4">

            <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center">
              <IconMail
                width={24}
                height={24}
                className="text-indigo-600"
              />
            </div>

            <div>

              <h1 className="text-2xl font-bold text-slate-900">
                Create Support Ticket
              </h1>

              <p className="text-slate-500 mt-1">
                Describe your issue and our support team will assist you.
              </p>

            </div>

          </div>

        </div>

        {/* Form */}

        <div className="p-8">

          <div className="mb-6">

            <label className="block text-sm font-medium text-slate-700 mb-2">
              Subject
            </label>

            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Example: Laptop not turning on"
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />

          </div>

          <div>

            <label className="block text-sm font-medium text-slate-700 mb-2">
              Issue Description
            </label>

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please provide as much information as possible..."
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm h-48 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />

          </div>

          <div className="mt-8 flex justify-end">

            <button
              onClick={submit}
              disabled={
                submitting ||
                !subject.trim() ||
                !description.trim()
              }
              className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-40 transition"
            >
              {submitting
                ? "Submitting..."
                : "Submit Ticket"}
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}