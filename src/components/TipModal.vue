<template>
  <div class="tip-modal-backdrop" @click.self="close">
    <div class="tip-modal" role="dialog" aria-modal="true" aria-labelledby="tipTitle">
      <header>
        <h3 id="tipTitle">Send a Tip</h3>
        <button class="close" @click="close" aria-label="Close">✕</button>
      </header>

      <section class="body">
        <p class="desc">Support the creator — choose a preset or enter a custom amount.</p>

        <div class="presets">
          <button v-for="a in presets" :key="a" @click="selectPreset(a)" :class="['preset', {active: amount === a}]">
            {{ formatCurrency(a) }}
          </button>
        </div>

        <div class="custom">
          <label for="customTip">Custom amount</label>
          <input id="customTip" type="number" min="0" step="0.01" v-model.number="customAmount" placeholder="0.00" />
          <button class="apply" @click="applyCustom">Apply</button>
        </div>

        <div class="summary">
          <div>To: <strong>{{ post?.title || 'Creator' }}</strong></div>
          <div class="amount">Amount: <strong>{{ formatCurrency(amount) }}</strong></div>
        </div>
      </section>

      <footer>
        <button class="cancel" @click="close">Cancel</button>
        <button class="confirm" @click="confirmTip" :disabled="!canConfirm">Send Tip</button>
      </footer>
    </div>
  </div>
</template>

<script>
import { ref, computed } from 'vue';
import store from '../store';

export default {
  props: {
    postId: { type: String, required: true }
  },
  emits: ['close', 'tipped'],
  setup(props, { emit }){
    const presets = [1,5,10];
    const amount = ref(presets[0]);
    const customAmount = ref(null);

    const post = computed(()=> store.state.posts.find(p=>p.id === props.postId));

    function formatCurrency(n){
      try { return new Intl.NumberFormat(undefined, {style:'currency', currency:'USD'}).format(n); } catch(e){ return `$${n}`; }
    }
    function selectPreset(a){ amount.value = a; customAmount.value = null; }
    function applyCustom(){ if(!customAmount.value) return; amount.value = Number(customAmount.value); }
    function close(){ emit('close'); }
    const canConfirm = computed(()=> amount.value > 0 && !isNaN(amount.value));
    async function confirmTip(){
      if(!canConfirm.value) return;
      try{
        await store.tipPost(props.postId, Number(amount.value));
        emit('tipped', { postId: props.postId, amount: Number(amount.value) });
        close();
      }catch(err){
        console.error('Tip failed', err);
        // keep modal open to allow retry
      }
    }

    return { presets, amount, customAmount, post, formatCurrency, selectPreset, applyCustom, close, confirmTip, canConfirm };
  }
}
</script>

<style scoped>
.tip-modal-backdrop{ position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.45); z-index:60; }
.tip-modal{ width:320px; background:var(--bg-panel); color:var(--text); border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.35); overflow:hidden; }
.tip-modal header{ display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid rgba(255,255,255,0.03); }
.tip-modal .body{ padding:14px 16px; }
.presets{ display:flex; gap:8px; margin-bottom:12px; }
.preset{ flex:1; padding:8px; border-radius:8px; background:var(--muted); border:none; cursor:pointer; }
.preset.active{ outline:2px solid var(--tip-green); box-shadow:0 4px 14px rgba(0,255,150,0.06); }
.custom{ display:flex; gap:8px; align-items:center; margin-bottom:12px; }
.custom input{ flex:1; padding:8px; border-radius:8px; border:1px solid rgba(0,0,0,0.1); }
.apply{ padding:8px 10px; border-radius:8px; background:var(--accent); color:#fff; border:none; }
.summary{ display:flex; justify-content:space-between; padding:8px 0; color:var(--muted-text); }
.tip-modal footer{ display:flex; gap:8px; padding:12px 16px; border-top:1px solid rgba(255,255,255,0.03); justify-content:flex-end; }
.cancel{ background:transparent; border:none; color:var(--muted-text); }
.confirm{ background:var(--tip-green); color:#fff; border:none; padding:8px 12px; border-radius:8px; }
.close{ background:transparent; border:none; font-size:14px; }
</style>
