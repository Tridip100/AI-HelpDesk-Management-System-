import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../../api/client";

export default function UserDashboard() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client
      .get("/tickets/")
      .then((res) => {
        setTickets(res.data || []);
      })
      .catch((err) => {
        console.error(err);
        setTickets([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const openTickets = tickets.filter(
    (t) =>
      t.status === "open" ||
      t.status === "assigned" ||
      t.status === "in_progress"
  );

  const resolvedTickets = tickets.filter(
    (t) => t.status === "resolved"
  );

  const pendingTickets = tickets.filter(
    (t) => t.status === "ai_pending"
  );

  return (
    <div className="w-full">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          Dashboard
        </h1>

        <p className="text-slate-500 mt-1">
          Track support requests and access AI-powered assistance.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Total Tickets
          </p>

          <p className="text-3xl font-bold text-slate-900 mt-2">
            {tickets.length}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Open Tickets
          </p>

          <p className="text-3xl font-bold text-amber-600 mt-2">
            {openTickets.length}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Pending AI Review
          </p>

          <p className="text-3xl font-bold text-indigo-600 mt-2">
            {pendingTickets.length}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Resolved
          </p>

          <p className="text-3xl font-bold text-emerald-600 mt-2">
            {resolvedTickets.length}
          </p>
        </div>

      </div>

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-6">

        {/* Recent Tickets */}
        <div className="col-span-12 xl:col-span-8 bg-white border border-slate-200 rounded-2xl shadow-sm">

          <div className="p-5 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900">
              Recent Tickets
            </h2>
          </div>

          {loading ? (
            <div className="p-10 text-center text-slate-500">
              Loading tickets...
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-10 text-center text-slate-500">
              No tickets found.
            </div>
          ) : (
            <table className="w-full">

              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                    Title
                  </th>

                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                    Status
                  </th>

                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                    Priority
                  </th>
                </tr>
              </thead>

              <tbody>

                {tickets.slice(0, 8).map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition"
                  >
                    <td className="px-5 py-4 text-slate-900">
                      {ticket.title}
                    </td>

                    <td className="px-5 py-4">
                      <span className="capitalize">
                        {ticket.status}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      {ticket.priority}
                    </td>
                  </tr>
                ))}

              </tbody>

            </table>
          )}

        </div>

        {/* Right Side */}
        <div className="col-span-12 xl:col-span-4 space-y-5">

          {/* Quick Actions */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">

            <h3 className="font-semibold text-slate-900 mb-4">
              Quick Actions
            </h3>

            <div className="grid grid-cols-2 gap-3">

              <Link
                to="/user/email"
                className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 hover:bg-indigo-100 transition"
              >
                <p className="font-semibold text-indigo-700">
                  Create Ticket
                </p>

                <p className="text-xs text-slate-500 mt-1">
                  Raise support request
                </p>
              </Link>

              <Link
                to="/user/chat"
                className="bg-blue-50 border border-blue-100 rounded-xl p-4 hover:bg-blue-100 transition"
              >
                <p className="font-semibold text-blue-700">
                  Live Chat
                </p>

                <p className="text-xs text-slate-500 mt-1">
                  Talk to support
                </p>
              </Link>

              <Link
                to="/user/voice"
                className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 hover:bg-emerald-100 transition"
              >
                <p className="font-semibold text-emerald-700">
                  Voice AI
                </p>

                <p className="text-xs text-slate-500 mt-1">
                  Speak with assistant
                </p>
              </Link>

              <Link
                to="/user/tickets"
                className="bg-purple-50 border border-purple-100 rounded-xl p-4 hover:bg-purple-100 transition"
              >
                <p className="font-semibold text-purple-700">
                  My Tickets
                </p>

                <p className="text-xs text-slate-500 mt-1">
                  View ticket history
                </p>
              </Link>

            </div>

          </div>

          {/* AI Assistant */}
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-5">

            <h3 className="font-semibold text-indigo-800 mb-2">
              AI Assistant
            </h3>

            <p className="text-sm text-slate-600 mb-4">
              Your AI support assistant is online and ready
              to diagnose issues, recommend solutions and
              create tickets automatically.
            </p>

            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-emerald-700">
                Online
              </span>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}