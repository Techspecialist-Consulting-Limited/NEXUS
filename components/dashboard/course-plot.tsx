"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { weekCode } from "@/lib/cycle";
import type { CoursePoint } from "@/lib/queries";

/*
 * Promised against delivered, eight weeks — GUIDE §12 and §14.
 *
 * Promised is drawn as a dashed outline with no fill because it is an
 * intention, not a fact; delivered is solid and filled because it happened.
 * The eye reads the space between them as the shortfall without needing a
 * legend to explain which is which.
 *
 * Axis labels are white/45 rather than the white/30 in GUIDE §14's chart
 * theme. At 11px, white/30 over the void measures about 2.6:1 and fails the
 * 4.5:1 that GUIDE §17 requires of the same interface.
 */

const AXIS_TICK = {
  fill: "rgba(255,255,255,0.45)",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
};

type Row = {
  week: string;
  promised: number;
  delivered: number;
};

export function CoursePlot({
  points,
  compact = false,
}: {
  points: CoursePoint[];
  compact?: boolean;
}) {
  if (points.length < 2) {
    return (
      <p className="py-10 text-center text-xs text-tertiary">
        Not enough history to plot a trend yet.
      </p>
    );
  }

  const data: Row[] = points.map((p) => ({
    week: weekCode(p.label),
    promised: p.promised,
    delivered: p.delivered,
  }));

  const totalPromised = points.reduce((s, p) => s + p.promised, 0);
  const totalDelivered = points.reduce((s, p) => s + p.delivered, 0);

  return (
    <figure className="m-0">
      {/* Compact on the command view: the trend is context there, not the
          subject, and the page has to fit one viewport. */}
      <div className={compact ? "h-32 w-full" : "h-56 w-full"}>
        <ResponsiveContainer width="100%" height="100%">
          {/*
            left: 0, not a negative margin.

            This was `left: -18`, which pulls the plot area outside the SVG
            surface and takes the y-axis labels with it — 9 of the 13 pixels of
            every tick were clipped, so the trend had no readable scale. The
            negative margin reclaimed a little whitespace and cost the chart its
            meaning.
          */}
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="deliveredFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-delivered)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--color-delivered)" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid
              stroke="rgba(255,255,255,0.05)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="week"
              tick={AXIS_TICK}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={compact ? 30 : 44}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.18)", strokeWidth: 1 }}
              contentStyle={{
                background: "rgba(20, 20, 28, 0.92)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                backdropFilter: "blur(20px)",
                color: "rgba(255,255,255,0.9)",
                fontSize: 12,
                fontFamily: "var(--font-body)",
              }}
              labelStyle={{ color: "rgba(255,255,255,0.55)", marginBottom: 4 }}
            />

            <Area
              type="monotone"
              dataKey="promised"
              name="Promised"
              stroke="var(--color-in-progress)"
              strokeWidth={2}
              strokeDasharray="5 4"
              fill="none"
              dot={false}
              activeDot={{ r: 3.5 }}
            />
            <Area
              type="monotone"
              dataKey="delivered"
              name="Delivered"
              stroke="var(--color-delivered)"
              strokeWidth={2.5}
              fill="url(#deliveredFill)"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Direct labels rather than a legend: read once, not looked up. */}
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-1 text-2xs text-tertiary">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-0 w-4 border-t-2 border-dashed"
            style={{ borderColor: "var(--color-in-progress)" }}
          />
          promised
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-0 w-4 border-t-2"
            style={{ borderColor: "var(--color-delivered)" }}
          />
          delivered
        </span>
        <span className="ml-auto">
          <span className="metric text-white/70">{totalDelivered}</span> of{" "}
          <span className="metric text-white/70">{totalPromised}</span> across{" "}
          {points.length} weeks
        </span>
      </figcaption>
    </figure>
  );
}
