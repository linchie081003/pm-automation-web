import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, getErrorMessage } from "../../api";
import { useAuth } from "../../auth";
import { formatProjectPhase } from "../../lib/projectPhase";
import TimelineEditorSandbox from "./timeline/TimelineEditorSandbox";
import type { ProjectDetail } from "./projectDetailTypes";
import { PROJECT_TABS, PROJECT_TAB_IDS, TIMELINE_BETA_TAB_ENABLED } from "./projectTabConfig";
import {
  DELIVERY_PHASES,
  milestoneProgressEditable,
  milestoneStructureEditable,
  poTabReadOnly,
  priorPhasesReadOnly,
  sphTimelineEditable,
  timelineProjectStartEditable,
} from "./projectPhaseAccess";
import { TabShell } from "./shared/TabLayout";
import { ProjectHealthPanel } from "./tabs/ProjectHealthPanel";
import { SphTab } from "./tabs/SphTab";
import { PoTab } from "./tabs/PoTab";
import { PreKickoffTab } from "./tabs/PreKickoffTab";
import { MembersTab } from "./tabs/MembersTab";
import { MilestonesTab } from "./tabs/MilestonesTab";
import { ChangeRequestsTab } from "./tabs/ChangeRequestsTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { ClickUpTab } from "./tabs/ClickUpTab";
import { ReportsTab } from "./tabs/ReportsTab";
import { RemindersTab } from "./tabs/RemindersTab";
import { AuditTrailTab } from "./tabs/AuditTrailTab";
import { EvaluationTab } from "./tabs/EvaluationTab";
import { ClosingProjectTab } from "./tabs/ClosingProjectTab";
export default function ProjectDetailShell() {
  const { id } = useParams();
  const projectId = Number(id);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = useAuth();
  const tabFromUrl = searchParams.get("tab") ?? "";
  const initialTab =
    tabFromUrl && PROJECT_TAB_IDS.has(tabFromUrl) ? tabFromUrl : "sph";
  const [tab, setTab] = useState(initialTab);
  const [milestoneRefreshKey, setMilestoneRefreshKey] = useState(0);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [gateRefreshKey, setGateRefreshKey] = useState(0);
  const [msg, setMsg] = useState("");
  const [msgIsError, setMsgIsError] = useState(false);
  const [advanceBusy, setAdvanceBusy] = useState(false);

  const refreshProject = () =>
    api<ProjectDetail>(`/projects/${projectId}`).then((d) => {
      setDetail(d);
      setGateRefreshKey((k) => k + 1);
      return d;
    });

  const load = refreshProject;

  useEffect(() => {
    load().catch((e) => {
      const message = getErrorMessage(e);
      if (message.includes("[Data tidak ditemukan]")) {
        navigate("/projects", { replace: true });
        return;
      }
      setMsgIsError(true);
      setMsg(message);
    });
  }, [projectId, navigate]);

  useEffect(() => {
    if (tabFromUrl && PROJECT_TAB_IDS.has(tabFromUrl) && tabFromUrl !== tab) {
      setTab(tabFromUrl);
    }
  }, [tabFromUrl, tab]);

  const selectTab = (tabId: string) => {
    setTab(tabId);
    const next = new URLSearchParams(searchParams);
    if (tabId === "sph") {
      next.delete("tab");
    } else {
      next.set("tab", tabId);
    }
    setSearchParams(next, { replace: true });
  };

  const advancePhase = async () => {
    setMsg("");
    setMsgIsError(false);
    setAdvanceBusy(true);
    try {
      await api(`/projects/${projectId}/advance-phase`, { method: "POST" });
      setMsg("Fase proyek berhasil dilanjutkan.");
      await load();
    } catch (e) {
      setMsgIsError(true);
      setMsg(getErrorMessage(e));
    } finally {
      setAdvanceBusy(false);
    }
  };

  return (
    <>
      <header className="project-page-head">
        <h1 className="page-title">
          {detail?.code} — {detail?.name}
        </h1>
        <div className="project-page-head__meta">
          {detail?.project_manager && (
            <span className="project-page-head__chip">
              PM <strong>{detail.project_manager}</strong>
            </span>
          )}
          {detail?.sph_no && (
            <span className="project-page-head__chip">
              SPH No. <strong>{detail.sph_no}</strong>
            </span>
          )}
          <span className="text-muted">Fase proyek</span>
          <span className="badge badge-indigo">
            {detail ? formatProjectPhase(detail.current_phase) : "—"}
          </span>
        </div>
      </header>
      {detail && (
        <ProjectHealthPanel
          projectId={projectId}
          detail={detail}
          gateRefreshKey={gateRefreshKey}
          canAdvance={can("projects.write")}
          canEditPm={can("projects.write")}
          msg={msg}
          msgIsError={msgIsError}
          onAdvance={advancePhase}
          advanceBusy={advanceBusy}
          onProjectUpdated={load}
          canDelete={can("projects.write")}
          onDeleted={() => {
            window.location.href = "/projects";
          }}
        />
      )}
      <div className="tabs" role="tablist">
        {PROJECT_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`tab-btn${tab === id ? " tab-btn--active" : ""}`}
            onClick={() => selectTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <TabShell>
      {tab === "sph" && detail && (
        <SphTab
          projectId={projectId}
          projectMethodology={detail.methodology ?? "waterfall"}
          timelineEditable={sphTimelineEditable(detail)}
          readOnlyPhase={priorPhasesReadOnly(detail)}
          onMethodologyChange={load}
          onProjectRefresh={load}
          onDraftTimelineChanged={() => setMilestoneRefreshKey((k) => k + 1)}
          onAdvanceToKickOff={() => {
            setMilestoneRefreshKey((k) => k + 1);
            load();
            selectTab("pre_kickoff");
          }}
        />
      )}
      {tab === "po" && detail && (
        <PoTab
          projectId={projectId}
          readOnly={poTabReadOnly(detail)}
          currentPhase={detail.current_phase}
          onProjectRefresh={load}
        />
      )}
      {tab === "pre_kickoff" && detail && (
        <PreKickoffTab
          projectId={projectId}
          readOnly={priorPhasesReadOnly(detail)}
          onTimelineChanged={() => setMilestoneRefreshKey((k) => k + 1)}
          onProjectRefresh={load}
        />
      )}
      {tab === "members" && <MembersTab projectId={projectId} />}
      {tab === "milestones" && detail && (
        <MilestonesTab
          projectId={projectId}
          refreshKey={milestoneRefreshKey}
          health={detail.health}
          plannedStartDate={detail.planned_start_date ?? null}
          timelineStartEditable={timelineProjectStartEditable(detail)}
          structureEditable={milestoneStructureEditable(detail)}
          progressEditable={milestoneProgressEditable(detail)}
          deliveryStartedAt={detail.delivery_started_at ?? null}
          currentPhase={detail.current_phase}
          onProjectRefresh={load}
        />
      )}
      {TIMELINE_BETA_TAB_ENABLED && tab === "timeline_editor_beta" && (
        <TimelineEditorSandbox projectId={projectId} />
      )}
      {tab === "change_requests" && detail && (
        <ChangeRequestsTab
          projectId={projectId}
          inDelivery={DELIVERY_PHASES.has(detail.current_phase)}
        />
      )}
      {tab === "documents" && <DocumentsTab projectId={projectId} detail={detail} />}
      {tab === "clickup" && <ClickUpTab projectId={projectId} />}
      {tab === "reports" && detail && (
        <ReportsTab
          projectId={projectId}
          projectCode={detail.code}
          projectName={detail.name}
          currentPhase={detail.current_phase}
          deliveryStarted={!!detail.delivery_started_at}
          kickoffTimelineConfirmed={!!detail.kickoff_timeline_confirmed_at}
          onProjectRefresh={load}
        />
      )}
      {tab === "reminders" && <RemindersTab projectId={projectId} />}
      {tab === "audit" && <AuditTrailTab projectId={projectId} refreshKey={gateRefreshKey} />}
      {tab === "evaluation" && <EvaluationTab projectId={projectId} />}
      {tab === "bast" && detail && (
        <ClosingProjectTab
          projectId={projectId}
          detail={detail}
          checklist={detail.bast_checklist}
          onSaved={load}
        />
      )}
      </TabShell>
    </>
  );
}

