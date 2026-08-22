"""Afterplay — autonomous short-form clipping agent.

Architecture (PRD 10), each stage spending strictly more than the last:

  1 RESOLVE     metadata + captions + heatmap        kilobytes
  2 UNDERSTAND  rank moments from text signals        kilobytes, no video
  3 EXTRACT     HTTP range-fetch only chosen windows  ~25% of the source
  4 EDIT        reframe + caption + brand, those secs only
  4b QC         look at real frames; repair and re-render if wrong
  5 DELIVER     manifest + assets, webhook, memory write-back

Public surface:

    from afterplay import Orchestrator, Settings, Brand
    job = Orchestrator(creator="ksi").run(
        "https://...", footage_rights="permission_granted", platforms=["shorts"]
    )
"""
from .core import (Brand, FFmpegError, AfterplayError, MediaInfo, PLATFORMS, Platform,
                   QCFailure, ResolveError, Settings, detect_encoder, probe)
from .understand import (HeuristicReasoner, LLMReasoner, MemoryReasoner, Moment,
                         Reasoner, Sentence, Word, parse_vtt, rank, sentences)
from .resolve import Source, from_info_json, from_local, resolve, stream_urls
from .produce import CropPath, RenderSpec, build_ass, extract, render, track_subject
from .qc import Finding, QCReport, run_qc, sample_frames
from .memory import CreatorMemory, FormatPrefs
from .channel_memory import ChannelMemory, StreamMention, ThreadRecord
from .insights import Analytics, Copy, generate_copy, sponsor_segments
from .vision import face_crop_path, track_subject_best
from .agent import (ClaudePolicy, ClipAgent, ClipResult, HeuristicPolicy, JobResult,
                    MemoryPolicy, Orchestrator, Policy, TOOLS)

__version__ = "0.1.0"

__all__ = [
    "Brand", "Settings", "Platform", "PLATFORMS", "MediaInfo", "probe",
    "detect_encoder", "AfterplayError", "FFmpegError", "ResolveError", "QCFailure",
    "Word", "Sentence", "Moment", "parse_vtt", "sentences", "rank",
    "Reasoner", "HeuristicReasoner", "LLMReasoner", "MemoryReasoner",
    "Source", "resolve", "from_local", "from_info_json", "stream_urls",
    "extract", "track_subject", "build_ass", "render", "RenderSpec", "CropPath",
    "run_qc", "sample_frames", "QCReport", "Finding",
    "CreatorMemory", "FormatPrefs", "ChannelMemory", "StreamMention", "ThreadRecord",
    "Orchestrator", "ClipAgent", "ClipResult", "JobResult",
    "Policy", "HeuristicPolicy", "ClaudePolicy", "MemoryPolicy", "TOOLS",
    "Analytics", "Copy", "generate_copy", "sponsor_segments",
    "track_subject_best", "face_crop_path",
    "__version__",
]
