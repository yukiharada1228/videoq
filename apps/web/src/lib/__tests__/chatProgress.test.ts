import { createChatProgress, updateChatProgress } from '../chatProgress';

describe('chat progress', () => {
  it('keeps searching while another parallel search is still running', () => {
    let progress = createChatProgress();
    progress = updateChatProgress(progress, { type: 'searching', search_id: 1, query: '回路' });
    progress = updateChatProgress(progress, { type: 'searching', search_id: 2, query: '定理' });
    progress = updateChatProgress(progress, { type: 'search_completed', search_id: 2, query: '定理', result_count: 0 });
    expect(progress.phase).toBe('searching');
    expect(progress.searches[1]).toMatchObject({ status: 'complete' });
    progress = updateChatProgress(progress, { type: 'search_completed', search_id: 1, query: '回路', result_count: 20 });
    expect(progress.phase).toBe('reviewing');
    progress = updateChatProgress(progress, { type: 'searching', search_id: 3, query: 'ドモルガン' });
    expect(progress.phase).toBe('searching');
    expect(progress.searches[0].status).toBe('complete');
  });

  it('preserves completed searches and stops unfinished ones on failure', () => {
    let progress = updateChatProgress(createChatProgress(), { type: 'searching', search_id: 1, query: '回路' });
    progress = updateChatProgress(progress, { type: 'search_completed', search_id: 1, query: '回路', result_count: 20 });
    progress = updateChatProgress(progress, { type: 'searching', search_id: 2, query: '追加検索' });
    progress = updateChatProgress(progress, { type: 'error', code: 'LLM_PROVIDER_ERROR', message: 'failed' });
    expect(progress.phase).toBe('error');
    expect(progress.searches.map((search) => search.status)).toEqual(['complete', 'interrupted']);
    expect(updateChatProgress(progress, { type: 'content_chunk', text: 'late' })).toBe(progress);
  });

  it('finishes searches from older APIs when answer content arrives', () => {
    let progress = updateChatProgress(createChatProgress(), { type: 'searching', query: '回路' });
    expect(updateChatProgress(progress, { type: 'content_chunk', text: '' })).toBe(progress);
    progress = updateChatProgress(progress, { type: 'content_chunk', text: '回答' });
    expect(progress.phase).toBe('answering');
    expect(progress.searches[0]).toEqual({ id: 1, query: '回路', status: 'complete' });
    progress = updateChatProgress(progress, { type: 'done', chat_log_id: 1, feedback: null });
    expect(progress.phase).toBe('complete');
  });
});
