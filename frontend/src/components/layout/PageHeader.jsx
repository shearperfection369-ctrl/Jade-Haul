import React from "react";

export default function PageHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-end justify-between mb-5 px-1">
      <div>
        <div className="mono text-[10px] uppercase tracking-[0.3em] text-primary">{subtitle}</div>
        <h1 className="text-3xl lg:text-4xl font-extrabold leading-tight">{title}</h1>
      </div>
      {right}
    </div>
  );
}
