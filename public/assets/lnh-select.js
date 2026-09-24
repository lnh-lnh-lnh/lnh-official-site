(() => {
  const closeAll = except => document.querySelectorAll('.lnh-select.is-open').forEach(element => {
    if (element !== except) close(element);
  });

  const close = wrapper => {
    wrapper.classList.remove('is-open');
    wrapper.querySelector('.lnh-select-trigger')?.setAttribute('aria-expanded', 'false');
  };

  const enhance = scope => {
    (scope || document).querySelectorAll('select:not([data-lnh-select-ready])').forEach(select => {
      select.dataset.lnhSelectReady = 'true';
      const wrapper = document.createElement('div');
      wrapper.className = 'lnh-select';
      select.parentNode.insertBefore(wrapper, select);
      wrapper.appendChild(select);
      select.classList.add('lnh-select-native');

      const trigger = document.createElement('button');
      trigger.className = 'lnh-select-trigger';
      trigger.type = 'button';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      const menu = document.createElement('div');
      menu.className = 'lnh-select-menu';
      menu.setAttribute('role', 'listbox');
      menu.setAttribute('aria-label', select.labels?.[0]?.textContent?.trim() || select.name || '선택');
      const options = [...select.options];

      const refresh = () => {
        const selected = select.selectedOptions[0];
        trigger.textContent = selected?.textContent?.trim() || '선택해 주세요';
        menu.querySelectorAll('[role="option"]').forEach(option => {
          const active = option.dataset.value === select.value;
          option.classList.toggle('is-selected', active);
          option.setAttribute('aria-selected', String(active));
        });
      };

      options.forEach(option => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'lnh-select-option';
        item.setAttribute('role', 'option');
        item.dataset.value = option.value;
        item.textContent = option.textContent.trim();
        item.disabled = option.disabled;
        item.addEventListener('click', () => {
          select.value = option.value;
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
          refresh();
          close(wrapper);
          trigger.focus();
        });
        menu.appendChild(item);
      });

      trigger.addEventListener('click', () => {
        const opening = !wrapper.classList.contains('is-open');
        closeAll(wrapper);
        wrapper.classList.toggle('is-open', opening);
        trigger.setAttribute('aria-expanded', String(opening));
        if (opening) menu.querySelector('.is-selected:not(:disabled), [role="option"]:not(:disabled)')?.focus();
      });
      trigger.addEventListener('keydown', event => {
        if (event.key === 'Escape') { close(wrapper); trigger.focus(); }
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (!wrapper.classList.contains('is-open')) trigger.click();
        }
      });
      menu.addEventListener('keydown', event => {
        const items = [...menu.querySelectorAll('[role="option"]:not(:disabled)')];
        const index = items.indexOf(document.activeElement);
        if (event.key === 'Escape') { event.preventDefault(); close(wrapper); trigger.focus(); }
        if (event.key === 'ArrowDown' && index < items.length - 1) { event.preventDefault(); items[index + 1].focus(); }
        if (event.key === 'ArrowUp') { event.preventDefault(); (items[index - 1] || trigger).focus(); }
      });
      select.addEventListener('change', refresh);
      wrapper.append(trigger, menu);
      refresh();
    });
  };

  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('.lnh-select')) closeAll();
  });
  window.LNHSelects = { enhance };
  document.addEventListener('DOMContentLoaded', () => enhance(document));
})();
