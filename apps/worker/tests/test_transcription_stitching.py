from worker_python.pipeline.transcription_stitching import stitch_chunks


def cue(start,end,text):return {'start':start,'end':end,'text':text}


def test_repeated_context_is_joined_without_losing_the_following_clause():
    rows=stitch_chunks([[cue(295,301,'安全なバックアップ')],[cue(299,307,'バックアップは毎日行います。')]],interval=300,duration=600)
    assert rows==[cue(295,307,'安全なバックアップは毎日行います。')]


def test_short_repeated_cues_only_merge_when_their_source_times_overlap():
    assert stitch_chunks([[cue(299,300.2,'はい')],[cue(299.5,300.3,'はい'),cue(300.5,301,'はい')]],interval=300,duration=600)==[
        cue(299,300.3,'はい'),cue(300.5,301,'はい')]


def test_unrelated_boundary_speech_and_unicode_are_preserved():
    rows=stitch_chunks([[cue(298,301,'設定を保存。')],[cue(299,304,'設定を保存。そして確認。')]],interval=300,duration=600)
    assert rows==[cue(298,304,'設定を保存。そして確認。')]
    rows=stitch_chunks([[cue(298,301,'別の発話')],[cue(299,304,'新しい発話')]],interval=300,duration=600)
    assert len(rows)==2


def test_offsets_are_not_applied_twice_and_eof_is_clipped():
    rows=stitch_chunks([[cue(299,301,'最初の文章')],[cue(599,602,'末尾の文章')]],interval=300,duration=600.25)
    assert rows[-1]==cue(599,600.25,'末尾の文章')


def test_non_overlapping_same_text_far_from_the_seam_is_never_removed():
    assert len(stitch_chunks([[cue(0,2,'繰り返し')],[cue(301,303,'繰り返し')]],interval=300,duration=600))==2


def test_english_overlap_preserves_the_space_before_the_next_clause():
    assert stitch_chunks([[cue(298,301,'Keep daily backups')],[cue(299,305,'daily backups and verify recovery.')]],interval=300,duration=600)==[
        cue(298,305,'Keep daily backups and verify recovery.')]
