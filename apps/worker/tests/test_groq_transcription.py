import logging
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx
import openai
import pytest

from worker_python.pipeline import transcription_provider as p


@pytest.fixture(autouse=True)
def configuration(monkeypatch):
    for key in ['WHISPER_BACKEND','TRANSCRIPTION_PROVIDER','TRANSCRIPTION_MODEL','DEPLOYMENT_EDITION']:
        monkeypatch.delenv(key,raising=False)
    monkeypatch.setenv('GROQ_API_KEY','gsk-private-test')
    monkeypatch.setenv('OPENAI_API_KEY','sk-private-test')
    monkeypatch.setattr(p.time,'sleep',lambda _:None)


def test_cloud_defaults_and_invalid_configuration(monkeypatch):
    assert p.speech_route().provider=='groq'
    assert p.speech_route().model=='whisper-large-v3-turbo'
    for key,value in [('TRANSCRIPTION_PROVIDER','typo'),('TRANSCRIPTION_MODEL','bad'),('GROQ_API_KEY','')]:
        with monkeypatch.context() as patch:
            patch.setenv(key,value)
            with pytest.raises(p.TranscriptionConfigurationError):p.speech_route()


def test_onprem_is_local_and_never_falls_back(monkeypatch,tmp_path):
    monkeypatch.setenv('DEPLOYMENT_EDITION','onprem')
    monkeypatch.setenv('WHISPER_LOCAL_URL','http://private-whisper/v1')
    assert p.speech_route().provider=='local'
    monkeypatch.setenv('TRANSCRIPTION_PROVIDER','groq')
    with pytest.raises(p.TranscriptionConfigurationError,match='On-premises'):p.speech_route()


def test_local_rejects_hosted_speech_endpoint(monkeypatch):
    monkeypatch.setenv('TRANSCRIPTION_PROVIDER','local')
    monkeypatch.setenv('WHISPER_LOCAL_URL','https://api.groq.com/openai/v1')
    with pytest.raises(p.TranscriptionConfigurationError,match='private'):p.speech_route()


@pytest.mark.parametrize('status',[429,500,502,503,504])
def test_transient_failures_retry_then_fallback_with_one_offset(monkeypatch,tmp_path,status):
    requests=[]
    def respond(request):
        requests.append(request)
        if request.url.host=='api.groq.com':
            return httpx.Response(status,json={'error':{'message':'Unavailable'}})
        return httpx.Response(200,json={'segments':[{'start':1.25,'end':2.5,'text':'日本語の字幕'}]})
    original=openai.OpenAI
    def client(**kwargs):return original(**kwargs,http_client=httpx.Client(transport=httpx.MockTransport(respond)))
    monkeypatch.setattr(openai,'OpenAI',client)
    audio=tmp_path/'clip.mp3';audio.write_bytes(b'audio')
    session,model=p._whisper_client()
    with session:
        assert p._whisper_file(session,audio,model,offset=300)==[{'start':301.25,'end':302.5,'text':'日本語の字幕'}]
    assert len(requests)==3
    assert requests[0].headers['authorization']=='Bearer gsk-private-test'
    assert requests[-1].headers['authorization']=='Bearer sk-private-test'
    assert b'whisper-1' in requests[-1].content
    assert all(c.is_closed() for c in session.clients.values())


@pytest.mark.parametrize('status',[400,401,403,404,422])
def test_auth_and_invalid_requests_are_not_retried_or_leaked(monkeypatch,tmp_path,caplog,status):
    requests=[]
    def respond(request):
        requests.append(request);return httpx.Response(status,json={'error':{'message':'gsk-private-test sk-private-test'}})
    original=openai.OpenAI
    monkeypatch.setattr(openai,'OpenAI',lambda **kw:original(**kw,http_client=httpx.Client(transport=httpx.MockTransport(respond))))
    audio=tmp_path/'clip.mp3';audio.write_bytes(b'audio')
    session,model=p._whisper_client()
    with session,pytest.raises(p.TranscriptionProviderError) as error:
        p._whisper_file(session,audio,model,offset=0)
    assert len(requests)==1
    assert 'private-test' not in str(error.value)+caplog.text


def test_timeout_falls_back_and_preserves_payload(monkeypatch,tmp_path):
    calls=[]
    def respond(request):
        calls.append(request)
        if request.url.host=='api.groq.com':raise httpx.ReadTimeout('timeout',request=request)
        return httpx.Response(200,json={'segments':[{'start':0,'end':1,'text':'音声'}]})
    original=openai.OpenAI
    monkeypatch.setattr(openai,'OpenAI',lambda **kw:original(**kw,http_client=httpx.Client(transport=httpx.MockTransport(respond))))
    audio=tmp_path/'clip.mp3';audio.write_bytes(b'audio')
    with p.TranscriptionSession(p.speech_route()) as session:assert session.transcribe(audio,offset=5)[0]['start']==5
    assert len(calls)==3


def test_metrics_capture_actual_provider_and_minimum_billing_without_content(monkeypatch,tmp_path):
    from worker_python.pipeline.speech_metrics import capture_speech_metrics
    original=openai.OpenAI
    def respond(request):
        return httpx.Response(200,json={'duration':5,'text':'private speech','segments':[{'start':0,'end':1,'text':'private speech'}]})
    monkeypatch.setattr(openai,'OpenAI',lambda **kw:original(**kw,http_client=httpx.Client(transport=httpx.MockTransport(respond))))
    audio=tmp_path/'clip.mp3';audio.write_bytes(b'audio')
    with capture_speech_metrics() as metrics,p.TranscriptionSession(p.speech_route()) as session:
        session.transcribe(audio,offset=0)
    assert len(metrics)==1 and metrics[0]['provider']=='groq'
    assert metrics[0]['estimated_cost_usd']==pytest.approx(10*.04/3600)
    assert 'private speech' not in str(metrics) and 'gsk-' not in str(metrics)


def test_tls_errors_never_fallback(monkeypatch,tmp_path):
    import ssl
    calls=[]
    def respond(request):
        calls.append(request)
        raise httpx.ConnectError('certificate verification failed',request=request) from ssl.SSLCertVerificationError('invalid certificate')
    original=openai.OpenAI
    monkeypatch.setattr(openai,'OpenAI',lambda **kw:original(**kw,http_client=httpx.Client(transport=httpx.MockTransport(respond))))
    audio=tmp_path/'clip.mp3';audio.write_bytes(b'audio')
    with p.TranscriptionSession(p.speech_route()) as session,pytest.raises(p.TranscriptionProviderError):session.transcribe(audio,offset=0)
    assert len(calls)==1


def test_explicit_openai_uses_its_key_and_endpoint(monkeypatch,tmp_path):
    monkeypatch.setenv('TRANSCRIPTION_PROVIDER','openai');monkeypatch.delenv('GROQ_API_KEY')
    route=p.speech_route();assert route.provider=='openai' and route.model=='whisper-1' and route.url=='https://api.openai.com/v1'
